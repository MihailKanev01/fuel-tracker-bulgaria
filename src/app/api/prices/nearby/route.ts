import { NextResponse } from "next/server";
import { FuelType } from "@prisma/client";
import { nearbyFuel } from "@/lib/nearby";

export const dynamic = "force-dynamic";

const aliases: Record<string, FuelType> = {
  diesel: "DIESEL",
  a95: "GASOLINE_95",
  a100: "GASOLINE_100",
  lpg: "LPG",
  cng: "CNG",
};

const numberParam = (value: string | null) => {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = numberParam(searchParams.get("lat"));
  const lon = numberParam(searchParams.get("lon"));
  const radius = numberParam(searchParams.get("radius")) ?? 5;
  const limit = Math.min(50, Math.max(1, Math.round(numberParam(searchParams.get("limit")) ?? 10)));
  const fuel = aliases[(searchParams.get("fuel") ?? "diesel").toLowerCase()];

  if (!fuel) return NextResponse.json({ error: "Unsupported fuel type" }, { status: 400 });
  if (lat == null || lon == null || lat < -90 || lat > 90 || lon < -180 || lon > 180) return NextResponse.json({ error: "Valid lat and lon are required." }, { status: 400 });
  if (radius <= 0 || radius > 100) return NextResponse.json({ error: "radius must be between 0 and 100 km." }, { status: 400 });

  try {
    return NextResponse.json(await nearbyFuel(lat, lon, radius, limit, fuel), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Nearby prices error:", error);
    return NextResponse.json({ error: "Unable to load nearby prices." }, { status: 500 });
  }
}
