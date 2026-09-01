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

type KaraiResponse = {
  fetchedAt?: string;
  averages?: Record<string, string | number | null | undefined>;
};

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

async function liveKaraiAverage(fuelType: FuelType) {
  const response = await fetch("https://karai.bg/api/fuel-prices", {
    headers: { Accept: "application/json", "User-Agent": "FuelTrackerBG/1.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) throw new Error(`KARAI API returned ${response.status}`);
  const data = (await response.json()) as KaraiResponse;
  const value = toNumber(data.averages?.[marketMetric[fuelType]]);
  if (value == null) throw new Error(`KARAI has no average for ${fuelType}`);

  const observedAt = data.fetchedAt ? new Date(data.fetchedAt) : new Date();
  const latest = Number.isNaN(observedAt.getTime()) ? new Date().toISOString() : observedAt.toISOString();

  return {
    average: value,
    lowest: null,
    highest: null,
    median: null,
    stationCount: 0,
    sourceCount: 1,
    confidence: 60,
    latest,
    dataType: "MARKET_AVERAGE" as const,
  };
}

export async function GET(_request: Request, context: { params: Promise<{ fuel: string }> }) {
  try {
    const { fuel } = await context.params;
    const fuelType = aliases[fuel.toLowerCase()];
    if (!fuelType) return NextResponse.json({ error: "Unsupported fuel type", fuel }, { status: 400 });

    // Preserve the old working behavior conceptually: get the live market
    // value from KARAI first, then fall back to persisted observations.
    const live = await liveKaraiAverage(fuelType);
    return NextResponse.json(live, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-FuelTracker-Data": "karai-live",
      },
    });
  } catch (liveError) {
    console.error("Fuel overview live source failed:", liveError);
  }

  try {
    const { fuel } = await context.params;
    const fuelType = aliases[fuel.toLowerCase()];
    if (!fuelType) return NextResponse.json({ error: "Unsupported fuel type", fuel }, { status: 400 });
    const result = await fuelOverview(fuelType);
    return NextResponse.json(
      { ...result, source: result.dataType === "STATION_PRICES" ? "fuelo-db" : "market-db" },
      { headers: { "Cache-Control": "no-store, max-age=0", "X-FuelTracker-Data": "neon" } },
    );
  } catch (databaseError) {
    console.error("Fuel overview Neon fallback failed:", databaseError);
    return NextResponse.json(
      { error: "Няма налична средна цена в момента." },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
