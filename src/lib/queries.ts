import { prisma } from "@/lib/prisma";

const asNumber = (value: { toNumber(): number } | null) => value?.toNumber() ?? null;

export async function dieselOverview() {
  const latestRows = await prisma.$queryRaw<
    {
      station_id: string;
      price_eur: { toNumber(): number };
      observed_at: Date;
      confidence: number;
    }[]
  >`
    SELECT DISTINCT ON ("stationId")
      "stationId" as station_id,
      "priceEur" as price_eur,
      "observedAt" as observed_at,
      confidence
    FROM "Price"
    WHERE "fuelType" = 'DIESEL' AND anomaly = false
    ORDER BY "stationId", "observedAt" DESC
  `;

  const values = latestRows
    .map((item) => item.price_eur.toNumber())
    .sort((a, b) => a - b);

  const sources = await prisma.source.count({
    where: { status: "ONLINE", lastSuccessAt: { not: null } },
  });

  if (values.length) {
    const latest = latestRows.reduce<Date | null>(
      (max, item) => (!max || item.observed_at > max ? item.observed_at : max),
      null,
    );

    const average =
      values.reduce((total, value) => total + value, 0) / values.length;
    const median = values[Math.floor(values.length / 2)];
    const confidence = Math.round(
      latestRows.reduce((total, row) => total + row.confidence, 0) /
        latestRows.length,
    );

    return {
      average,
      lowest: values[0] ?? null,
      highest: values.at(-1) ?? null,
      median,
      stationCount: values.length,
      sourceCount: sources,
      confidence,
      latest,
      dataType: "STATION_PRICES" as const,
    };
  }

  const marketAverage = await prisma.marketDatum.findFirst({
    where: { metric: "fuel.diesel.average" },
    orderBy: { observedAt: "desc" },
  });

  if (!marketAverage) {
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

  return {
    average: marketAverage.value.toNumber(),
    lowest: null,
    highest: null,
    median: null,
    stationCount: 0,
    sourceCount: sources,
    confidence: null,
    latest: marketAverage.observedAt,
    dataType: "MARKET_AVERAGE" as const,
  };
}

export async function dieselHistory(days = 30, city?: string) {
  const from = new Date(Date.now() - days * 86_400_000);

  const prices = await prisma.price.findMany({
    where: {
      fuelType: "DIESEL",
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
      grouped.set(key, [
        ...(grouped.get(key) ?? []),
        price.priceEur.toNumber(),
      ]);
    }

    return [...grouped].map(([date, values]) => ({
      date,
      average:
        values.reduce((sum, value) => sum + value, 0) / values.length,
      minimum: Math.min(...values),
      maximum: Math.max(...values),
    }));
  }

  if (city) return [];

  const marketHistory = await prisma.marketDatum.findMany({
    where: {
      metric: "fuel.diesel.average",
      observedAt: { gte: from },
    },
    orderBy: { observedAt: "asc" },
    select: { value: true, observedAt: true },
  });

  const groupedMarket = new Map<string, number[]>();

  for (const item of marketHistory) {
    const key = item.observedAt.toISOString().slice(0, 10);
    groupedMarket.set(key, [
      ...(groupedMarket.get(key) ?? []),
      item.value.toNumber(),
    ]);
  }

  return [...groupedMarket].map(([date, values]) => ({
    date,
    average:
      values.reduce((sum, value) => sum + value, 0) / values.length,
    minimum: Math.min(...values),
    maximum: Math.max(...values),
  }));
}

export async function cheapestDiesel(limit = 10, city?: string) {
  const stations = await prisma.station.findMany({
    where: { active: true, ...(city ? { city } : {}) },
    include: {
      prices: {
        where: { fuelType: "DIESEL", anomaly: false },
        orderBy: { observedAt: "desc" },
        take: 1,
      },
    },
  });

  return stations
    .flatMap((station) =>
      station.prices.map((price) => ({
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
      })),
    )
    .sort((a, b) => a.price - b.price)
    .slice(0, limit);
}
