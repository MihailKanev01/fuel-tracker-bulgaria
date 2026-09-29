import { NextResponse } from "next/server";
import { FuelType } from "@prisma/client";
import { getStationDetail } from "@/lib/station";

const aliases: Record<string, FuelType> = {
  diesel: "DIESEL",
  a95: "GASOLINE_95",
  a100: "GASOLINE_100",
  lpg: "LPG",
  cng: "CNG",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const fuelType = aliases[(searchParams.get("fuel") ?? "diesel").toLowerCase()];

  if (!fuelType) {
    return NextResponse.json({ error: "Unsupported fuel type" }, { status: 400 });
  }

  try {
    const station = await getStationDetail(id, fuelType);
    if (!station) {
      return NextResponse.json({ error: "Станцията не е намерена." }, { status: 404 });
    }

    return NextResponse.json(station, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error("Station detail route error:", error);
    return NextResponse.json(
      { error: "Неуспяхме да заредим станцията." },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
