import { NextResponse } from "next/server";
import { FuelType } from "@prisma/client";
import { cheapestFuel } from "@/lib/queries";
import { parseIntegerParam } from "@/lib/api-params";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const aliases: Record<string, FuelType> = {
  diesel: "DIESEL",
  a95: "GASOLINE_95",
  a100: "GASOLINE_100",
  lpg: "LPG",
  cng: "CNG",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fuel = aliases[(searchParams.get("fuel") ?? "diesel").toLowerCase()];
  if (!fuel) return NextResponse.json({ error: "Unsupported fuel type" }, { status: 400 });
  const limit = parseIntegerParam(searchParams.get("limit"), 10, 1, 100);
  try {
    const result = await cheapestFuel(fuel, limit, searchParams.get("city") ?? undefined);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error(`Cheapest fuel error (${fuel}):`, error);
    return NextResponse.json({ error: "Неуспяхме да заредим цените." }, { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
