import { NextResponse } from "next/server";
import { FuelType } from "@prisma/client";
import { fuelOverview } from "@/lib/queries";
import { KaraiAdapter } from "@/lib/collectors/karai";
import { ingestMarket } from "@/lib/ingest";

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

export async function GET(_request: Request, context: { params: Promise<{ fuel: string }> }) {
  const { fuel } = await context.params;
  const fuelType = aliases[fuel.toLowerCase()];
  if (!fuelType) return NextResponse.json({ error: "Unsupported fuel type" }, { status: 400 });

  try {
    let result = await fuelOverview(fuelType);

    // Self-heal an empty production database for the overview card.
    // KARAI provides a lightweight market average for all supported fuels.
    if (result.average == null) {
      try {
        await ingestMarket(new KaraiAdapter());
        result = await fuelOverview(fuelType);
      } catch (seedError) {
        console.error(`Fuel overview seed failed (${fuel}):`, seedError);
      }
    }

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error(`Fuel overview error (${fuel}):`, error);
    return NextResponse.json(
      { error: "Неуспяхме да заредим данните за горивото." },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
