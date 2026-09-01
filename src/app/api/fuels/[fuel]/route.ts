import { NextResponse } from "next/server";
import { fuelOverview } from "@/lib/queries";
import type { FuelType } from "@prisma/client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const aliases: Record<string, FuelType> = {
  diesel: "DIESEL",
  a95: "GASOLINE_95",
  gasolina95: "GASOLINE_95",
  a100: "GASOLINE_100",
  gasoline100: "GASOLINE_100",
  lpg: "LPG",
  cng: "CNG",
};

const marketMetric: Record<FuelType, string> = {
  DIESEL: "diesel",
  GASOLINE_95: "a95",
  GASOLINE_100: "a100",
  LPG: "lpg",
  CNG: "methane",
};

const fuelLabels: Record<FuelType, string> = {
  DIESEL: "diesel",
  GASOLINE_95: "A95",
  GASOLINE_100: "A100",
  LPG: "LPG",
  CNG: "CNG",
};

type KaraiProvider = {
  name?: string;
  diesel?: string | number | null;
  a95?: string | number | null;
  a100?: string | number | null;
  lpg?: string | number | null;
  methane?: string | number | null;
};

type KaraiResponse = {
  fetchedAt?: string;
  averages?: Record<string, string | number | null | undefined>;
  providers?: KaraiProvider[];
};

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

async function liveKaraiAverage(fuelType: FuelType) {
  const response = await fetch("https://karai.bg/api/fuel-prices", {
    headers: { Accept: "application/json", "User-Agent": "FuelTrackerBG/1.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) throw new Error(`KARAI API returned ${response.status}`);
  const data = (await response.json()) as KaraiResponse;
  const metricKey = marketMetric[fuelType];

  let value = toNumber(data.averages?.[metricKey]);
  let providerValues: number[] = [];

  if (data.providers?.length) {
    providerValues = data.providers
      .map((provider) => toNumber(provider[metricKey as keyof KaraiProvider] as string | number | null | undefined))
      .filter((item): item is number => item != null);

    // A100 can be missing from the national average while still being
    // available for individual providers.
    if (value == null && providerValues.length) {
      value = providerValues.reduce((sum, item) => sum + item, 0) / providerValues.length;
    }
  }

  if (value == null) throw new Error(`KARAI has no average for ${fuelLabels[fuelType]}`);

  const observedAt = data.fetchedAt ? new Date(data.fetchedAt) : new Date();
  const latest = Number.isNaN(observedAt.getTime()) ? new Date().toISOString() : observedAt.toISOString();

  return {
    average: value,
    lowest: providerValues.length ? Math.min(...providerValues) : null,
    highest: providerValues.length ? Math.max(...providerValues) : null,
    median: median(providerValues),
    stationCount: providerValues.length,
    sourceCount: 1,
    confidence: providerValues.length >= 5 ? 75 : providerValues.length >= 3 ? 70 : 60,
    latest,
    dataType: "MARKET_AVERAGE" as const,
  };
}

export async function GET(_request: Request, context: { params: Promise<{ fuel: string }> }) {
  try {
    const { fuel } = await context.params;
    const fuelType = aliases[fuel.toLowerCase()];
    if (!fuelType) return NextResponse.json({ error: "Unsupported fuel type", fuel }, { status: 400 });

    // Prefer persisted Fuelo station data when available because it gives us
    // the true station-level low/high/median values. If only a stored market
    // average exists, enrich it with live KARAI provider observations so the
    // statistics cards are populated instead of showing dashes.
    let persisted: Awaited<ReturnType<typeof fuelOverview>> | null = null;
    try {
      persisted = await fuelOverview(fuelType);
      if (persisted.average != null && persisted.dataType === "STATION_PRICES") {
        return NextResponse.json(
          { ...persisted, source: "fuelo-db" },
          { headers: { "Cache-Control": "no-store, max-age=0", "X-FuelTracker-Data": "neon" } },
        );
      }
    } catch (databaseError) {
      console.error(`Fuel overview Neon read failed (${fuel}):`, databaseError);
    }

    try {
      const live = await liveKaraiAverage(fuelType);
      return NextResponse.json(live, {
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "X-FuelTracker-Data": "karai-live",
        },
      });
    } catch (liveError) {
      console.error(`Fuel overview live KARAI failed (${fuel}):`, liveError);
    }

    if (persisted?.average != null) {
      return NextResponse.json(
        { ...persisted, source: "market-db" },
        { headers: { "Cache-Control": "no-store, max-age=0", "X-FuelTracker-Data": "neon" } },
      );
    }

    return NextResponse.json(
      { error: "Няма налична средна цена в момента.", fuel },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("Unhandled fuel overview route error:", error);
    return NextResponse.json(
      { error: "Вътрешна грешка при зареждане на цената." },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
