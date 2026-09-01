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

function stripHtml(value: string) {
  return value
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTableRows(html: string) {
  return [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
    [...row[1].matchAll(/<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)].map((cell) => stripHtml(cell[1])),
  ).filter((row) => row.length > 0);
}

async function liveFueloA100Overview() {
  const sofiaNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Sofia" }));
  const dates = [0, 1, 2].map((offset) => {
    const date = new Date(sofiaNow);
    date.setDate(date.getDate() - offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  });

  for (const date of dates) {
    try {
      const response = await fetch(`https://bg.fuelo.net/prices/date/${date}?lang=bg`, {
        headers: { Accept: "text/html", "User-Agent": "FuelTrackerBG/1.0" },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) continue;

      const html = await response.text();
      const rows = parseTableRows(html);
      const headerIndex = rows.findIndex((row) => row.some((cell) => /^A98\+$/i.test(cell) || /A100/i.test(cell)));
      const averageIndex = rows.findIndex((row) => /^Средна цена$/i.test(row[0] ?? "") || /^Avg price$/i.test(row[0] ?? ""));
      if (headerIndex < 0 || averageIndex < 0) continue;

      const header = rows[headerIndex];
      const fuelColumn = header.findIndex((cell) => /^A98\+$/i.test(cell) || /A100/i.test(cell));
      if (fuelColumn < 0) continue;

      const parseCellPrice = (cell: string) => {
        const match = cell.match(/([0-9]+(?:[.,][0-9]+)?)/);
        if (!match) return null;
        const value = Number(match[1].replace(",", "."));
        return Number.isFinite(value) && value > 0 ? value : null;
      };

      const average = parseCellPrice(rows[averageIndex]?.[fuelColumn] ?? "");
      if (average == null) continue;

      const providerValues = rows
        .slice(averageIndex + 1)
        .filter((row) => row[0] && row[0] !== "Детайли" && row[0] !== "Details")
        .map((row) => parseCellPrice(row[fuelColumn] ?? ""))
        .filter((value): value is number => value != null);

      const values = providerValues.length ? providerValues : [average];
      return {
        average,
        lowest: Math.min(...values),
        highest: Math.max(...values),
        median: median(values),
        stationCount: providerValues.length,
        sourceCount: 1,
        confidence: providerValues.length >= 8 ? 82 : providerValues.length >= 5 ? 78 : 70,
        latest: new Date(`${date}T12:00:00+03:00`),
        dataType: "MARKET_AVERAGE" as const,
      };
    } catch {
      // Try the previous day's Fuelo snapshot when today's page is unavailable.
    }
  }

  return null;
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
  const national = await prisma.marketDatum.findFirst({ where: { metric: averageMetric }, orderBy: { observedAt: "desc" }, select: { value: true, observedAt: true } });

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

  const providerValues = [...latestByProvider.values()].map((row) => row.value).filter(Number.isFinite);
  const average = national?.value.toNumber() ?? (providerValues.length ? providerValues.reduce((sum, value) => sum + value, 0) / providerValues.length : null);
  const statisticValues = providerValues.length ? providerValues : (national ? [national.value.toNumber()] : []);
  const latest = national?.observedAt ?? [...latestByProvider.values()].map((row) => row.observedAt).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  if (average != null) {
    return {
      average,
      lowest: statisticValues.length ? Math.min(...statisticValues) : null,
      highest: statisticValues.length ? Math.max(...statisticValues) : null,
      median: median(statisticValues),
      stationCount: 0,
      sourceCount: sources,
      confidence: providerValues.length >= 5 ? 75 : providerValues.length >= 2 ? 70 : 60,
      latest,
      dataType: "MARKET_AVERAGE" as const,
    };
  }

  // A100 is not consistently supplied as a national market metric. Fuelo's
  // public national A98+/100 table remains a useful live fallback with
  // provider-level observations from the same daily snapshot.
  if (fuelType === "GASOLINE_100") {
    const fuelo = await liveFueloA100Overview();
    if (fuelo) return { ...fuelo, sourceCount: Math.max(1, sources) };
  }

  return {
    average: null,
    lowest: null,
    highest: null,
    median: null,
    stationCount: 0,
    sourceCount: sources,
    confidence: null,
    latest: null,
    dataType: "NO_DATA" as const,
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
