import { FuelType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const asNumber = (value: { toNumber(): number } | null) => value?.toNumber() ?? null;

export const FUEL_LABELS: Record<FuelType, string> = {
  DIESEL: "Diesel",
  GASOLINE_95: "A95",
  GASOLINE_100: "A100",
  LPG: "LPG",
  CNG: "CNG",
};

function fuelMetricKey(fuelType: FuelType) {
  return fuelType === "GASOLINE_95" ? "a95" : fuelType === "GASOLINE_100" ? "a100" : fuelType === "LPG" ? "lpg" : fuelType === "CNG" ? "cng" : "diesel";
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export async function fuelOverview(fuelType: FuelType) {
  const latestRows = await prisma.$queryRaw<
    { station_id: string; price_eur: { toNumber(): number }; observed_at: Date; confidence: number }[]
  >`
    SELECT DISTINCT ON ("stationId")
      "stationId" as station_id,
      "priceEur" as price_eur,
      "observedAt" as observed_at,
      confidence
    FROM "Price"
    WHERE "fuelType" = ${fuelType} AND anomaly = false
    ORDER BY "stationId", "observedAt" DESC
  `;

  const values = latestRows.map((item) => item.price_eur.toNumber()).filter(Number.isFinite).sort((a, b) => a - b);
  const sources = await prisma.source.count({ where: { status: "ONLINE", lastSuccessAt: { not: null } } });

  if (values.length) {
    const latest = latestRows.reduce<Date | null>((max, item) => (!max || item.observed_at > max ? item.observed_at : max), null);
    return {
      average: values.reduce((total, value) => total + value, 0) / values.length,
      lowest: values[0] ?? null,
      highest: values.at(-1) ?? null,
      median: median(values),
      stationCount: values.length,
      sourceCount: sources,
      confidence: Math.round(latestRows.reduce((total, row) => total + row.confidence, 0) / latestRows.length),
      latest,
      dataType: "STATION_PRICES" as const,
    };
  }

  const metricKey = fuelMetricKey(fuelType);
  const averageMetric = `fuel.${metricKey}.average`;

  // Keep the market fallback deliberately simple and independent from the
  // provider query. This mirrors the original working Diesel overview path
  // and also works when a fuel has only a stored national average (notably A100).
  const national = await prisma.marketDatum.findFirst({
    where: { metric: averageMetric },
    orderBy: { observedAt: "desc" },
    select: { value: true, observedAt: true },
  });

  const providerRows = await prisma.marketDatum.findMany({
    where: { metric: { startsWith: "provider.", endsWith: `.${metricKey}` } },
    orderBy: { observedAt: "desc" },
    select: { metric: true, value: true, observedAt: true },
  });

  const latestByProvider = new Map<string, { value: number; observedAt: Date }>();
  for (const row of providerRows) {
    const name = row.metric.slice("provider.".length, -(metricKey.length + 1));
    if (!name || latestByProvider.has(name)) continue;
    latestByProvider.set(name, { value: row.value.toNumber(), observedAt: row.observedAt });
  }

  const providerValues = [...latestByProvider.values()]
    .map((row) => row.value)
    .filter(Number.isFinite);

  const average = national?.value.toNumber() ?? (providerValues.length
    ? providerValues.reduce((sum, value) => sum + value, 0) / providerValues.length
    : null);

  const statisticValues = providerValues.length ? providerValues : (national ? [national.value.toNumber()] : []);
  const latest = national?.observedAt ?? [...latestByProvider.values()]
    .map((row) => row.observedAt)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  return {
    average,
    lowest: statisticValues.length ? Math.min(...statisticValues) : null,
    highest: statisticValues.length ? Math.max(...statisticValues) : null,
    median: median(statisticValues),
    stationCount: 0,
    sourceCount: sources,
    confidence: average != null ? (providerValues.length >= 5 ? 75 : providerValues.length >= 2 ? 70 : 60) : null,
    latest,
    dataType: average != null ? "MARKET_AVERAGE" as const : "NO_DATA" as const,
  };
}

export async function dieselOverview() { return fuelOverview("DIESEL"); }

export async function fuelHistory(fuelType: FuelType, days = 30, city?: string) {
  const from = new Date(Date.now() - days * 86_400_000);
  const prices = await prisma.price.findMany({
    where: { fuelType, anomaly: false, observedAt: { gte: from }, ...(city ? { station: { city } } : {}) },
    select: { priceEur: true, observedAt: true },
    orderBy: { observedAt: "asc" },
  });

  if (prices.length) {
    const grouped = new Map<string, number[]>();
    for (const price of prices) {
      const key = price.observedAt.toISOString().slice(0, 10);
      grouped.set(key, [...(grouped.get(key) ?? []), price.priceEur.toNumber()]);
    }
    return [...grouped].map(([date, values]) => ({ date, average: values.reduce((sum, value) => sum + value, 0) / values.length, minimum: Math.min(...values), maximum: Math.max(...values) }));
  }

  if (city) return [];
  const metric = `fuel.${fuelMetricKey(fuelType)}.average`;
  const marketHistory = await prisma.marketDatum.findMany({ where: { metric, observedAt: { gte: from } }, orderBy: { observedAt: "asc" }, select: { value: true, observedAt: true } });
  const groupedMarket = new Map<string, number[]>();
  for (const item of marketHistory) {
    const key = item.observedAt.toISOString().slice(0, 10);
    groupedMarket.set(key, [...(groupedMarket.get(key) ?? []), item.value.toNumber()]);
  }
  return [...groupedMarket].map(([date, values]) => ({ date, average: values.reduce((sum, value) => sum + value, 0) / values.length, minimum: Math.min(...values), maximum: Math.max(...values) }));
}

export async function dieselHistory(days = 30, city?: string) { return fuelHistory("DIESEL", days, city); }

export async function cheapestFuel(fuelType: FuelType, limit = 10, city?: string) {
  const stations = await prisma.station.findMany({
    where: { active: true, ...(city ? { city } : {}) },
    include: { prices: { where: { fuelType, anomaly: false }, orderBy: { observedAt: "desc" }, take: 1 } },
  });
  return stations.flatMap((station) => station.prices.map((price) => ({
    id: station.id,
    name: station.name,
    brand: station.brand,
    city: station.city,
    address: station.address,
    price: price.priceEur.toNumber(),
    observedAt: price.observedAt,
    confidence: price.confidence,
    sourceUrl: price.originalUrl,
    latitude: asNumber(station.latitude),
    longitude: asNumber(station.longitude),
  }))).sort((a, b) => a.price - b.price).slice(0, limit);
}

export async function cheapestDiesel(limit = 10, city?: string) { return cheapestFuel("DIESEL", limit, city); }
