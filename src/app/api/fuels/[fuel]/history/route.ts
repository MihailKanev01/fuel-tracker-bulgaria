import { NextResponse } from "next/server";
import { FuelType } from "@prisma/client";
import { fuelHistory } from "@/lib/queries";

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

export async function GET(request: Request, context: { params: Promise<{ fuel: string }> }) {
  const { fuel } = await context.params;
  const fuelType = aliases[fuel.toLowerCase()];
  if (!fuelType) return NextResponse.json({ error: "Unsupported fuel type" }, { status: 400 });
  const { searchParams } = new URL(request.url);
  const days = Math.min(365, Math.max(1, Number(searchParams.get("days") ?? 30)));
  return NextResponse.json(await fuelHistory(fuelType, days, searchParams.get("city") ?? undefined));
}
