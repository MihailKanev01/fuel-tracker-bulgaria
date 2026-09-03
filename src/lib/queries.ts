import { FuelType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const asNumber = (value: { toNumber(): number } | string | number | null) => {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return value.toNumber();
};

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

/**
 * One identical station-level calculation is used for every fuel type.
 * We intentionally do not replace station statistics with a market/provider
 * average when station observations exist.
 */
export async function fuelOverview(fuelType: FuelType) {
  // Read station observations through Prisma instead of relying on raw SQL
  // result typing. This keeps the production path consistent across all
  // database environments while still selecting only the latest observation
  // for each station below.
  const priceRows = await prisma.price.findMany({
    where: {
      fuelType,
      anomaly: false,
    },
    select: {
      stationId: true,
      priceEur: true,
      observedAt: true,
      confidence: true,
    },
    orderBy: [
      { observedAt: "desc" },
      { stationId: "asc" },
    ],
  });

  const latestByStation = new Map<
    string,
    { priceEur: number | string | { toNumber(): number }; observedAt: Date; confidence: number }
  >();

  for (const row of priceRows) {
    if (!latestByStation.has(row.stationId)) {
      latestByStation.set(row.stationId, row);
    }
  }

  const latestRows = [...latestByStation.values()];
  const values = latestRows
    .map((item) => asNumber(item.priceEur))
    .filter((value): value is number => value != null)
    .sort((a, b) => a - b);

  let sources = 0;
  try {
    sources = await prisma.source.count({
      where: { status: "ONLINE", lastSuccessAt: { not: null } },
    });
  } catch (error) {
    console.error("Fuel overview source count failed:", error);
  }

  if (!values.length) {
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

  const latest = latestRows.reduce<Date | null>(
    (max, item) => (!max || item.observedAt > max ? item.observedAt : max),
    null,
  );

  return {
    average: values.reduce((total, value) => total + value, 0) / values.length,
    lowest: values[0] ?? null,
    highest: values.at(-1) ?? null,
    median: median(values),
    stationCount: values.length,
    sourceCount: sources,
    confidence: Math.round(
      latestRows.reduce((total, row) => total + row.confidence, 0) / latestRows.length,
    ),
    latest,
    dataType: "STATION_PRICES" as const,
  };
}

export async function dieselOverview() {
  return fuelOverview("DIESEL");
}

export async function fuelHistory(fuelType: FuelType, days = 30, city?: string) {
  const from = new Date(Date.now() - days * 86_400_000);
  const prices = await prisma.price.findMany({
    where: {
      fuelType,
      anomaly: false,
      observedAt: { gte: from },
      ...(city ? { station: { city } } : {}),
    },
    select: { priceEur: true, observedAt: true },
    orderBy: { observedAt: "asc" },
  });

  if (prices.length) {
    const grouped = new Map<string, number[]>();
    for (const price of prices) {
      const key = price.observedAt.toISOString().slice(0, 10);
      grouped.set(key, [...(grouped.get(key) ?? []), price.priceEur.toNumber()]);
    }
    return [...grouped].map(([date, values]) => ({
      date,
      average: values.reduce((sum, value) => sum + value, 0) / values.length,
      minimum: Math.min(...values),
      maximum: Math.max(...values),
    }));
  }

  if (city) return [];

  const metric = `fuel.${fuelMetricKey(fuelType)}.average`;
  const marketHistory = await prisma.marketDatum.findMany({
    where: { metric, observedAt: { gte: from } },
    orderBy: { observedAt: "asc" },
    select: { value: true, observedAt: true },
  });
  const groupedMarket = new Map<string, number[]>();
  for (const item of marketHistory) {
    const key = item.observedAt.toISOString().slice(0, 10);
    groupedMarket.set(key, [...(groupedMarket.get(key) ?? []), item.value.toNumber()]);
  }
  return [...groupedMarket].map(([date, values]) => ({
    date,
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
    minimum: Math.min(...values),
    maximum: Math.max(...values),
  }));
}

export async function dieselHistory(days = 30, city?: string) {
  return fuelHistory("DIESEL", days, city);
}

export async function cheapestFuel(fuelType: FuelType, limit = 10, city?: string) {
  const stations = await prisma.station.findMany({
    where: { active: true, ...(city ? { city } : {}) },
    include: {
      prices: {
        where: { fuelType, anomaly: false },
        orderBy: { observedAt: "desc" },
        take: 1,
      },
    },
  });
  return stations
    .flatMap((station) => station.prices.map((price) => ({
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
    })))
    .sort((a, b) => a.price - b.price)
    .slice(0, limit);
}

export async function cheapestDiesel(limit = 10, city?: string) {
  return cheapestFuel("DIESEL", limit, city);
}
