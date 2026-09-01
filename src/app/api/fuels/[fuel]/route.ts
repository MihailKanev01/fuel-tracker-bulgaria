import { NextResponse } from "next/server";
import { FuelType } from "@prisma/client";
import { fuelOverview } from "@/lib/queries";

export const dynamic = "force-dynamic";

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
  return NextResponse.json(await fuelOverview(fuelType), { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } });
}
