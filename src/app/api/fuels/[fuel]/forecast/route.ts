import { NextResponse } from "next/server";
import { FuelType } from "@prisma/client";
import { fuelForecast } from "@/lib/forecast";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const fuelMap: Record<string, FuelType> = {
  diesel: "DIESEL",
  a95: "GASOLINE_95",
  a100: "GASOLINE_100",
  lpg: "LPG",
  cng: "CNG",
};

export async function GET(_request: Request, { params }: { params: Promise<{ fuel: string }> }) {
  const { fuel } = await params;
  const fuelType = fuelMap[fuel.toLowerCase()];
  if (!fuelType) return NextResponse.json({ error: "Невалидно гориво." }, { status: 400 });
  try {
    return NextResponse.json(await fuelForecast(fuelType));
  } catch (error) {
    console.error(`Fuel forecast error (${fuel}):`, error);
    return NextResponse.json({ error: "Неуспяхме да изчислим прогнозата." }, { status: 500 });
  }
}
