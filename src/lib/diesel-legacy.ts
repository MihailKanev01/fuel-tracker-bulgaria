import { prisma } from "@/lib/prisma";

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/**
 * Legacy Diesel overview logic used before multi-fuel support was introduced.
 * Keep Diesel on this path so its overview remains based on the latest
 * station-level Fuelo observations, excluding anomalies.
 */
export async function dieselOverviewLegacy() {
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
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  const latest = latestRows.reduce<Date | null>(
    (max, item) => (!max || item.observed_at > max ? item.observed_at : max),
    null,
  );

  const sources = await prisma.source.count({
    where: { status: "ONLINE", lastSuccessAt: { not: null } },
  });

  const average = values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : null;

  const confidence = latestRows.length
    ? Math.round(
        latestRows.reduce((total, row) => total + row.confidence, 0) /
          latestRows.length,
      )
    : null;

  return {
    average,
    lowest: values[0] ?? null,
    highest: values.at(-1) ?? null,
    median: median(values),
    stationCount: values.length,
    sourceCount: sources,
    confidence,
    latest,
    dataType: "STATION_PRICES" as const,
  };
}
