import { NextResponse } from "next/server";
import { nearbyDiesel } from "@/lib/queries";

export const dynamic = "force-dynamic";

const numberParam = (value: string | null) => {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = numberParam(searchParams.get("lat"));
  const lon = numberParam(searchParams.get("lon"));
  const radius = numberParam(searchParams.get("radius")) ?? 25;
  const limit = Math.min(50, Math.max(1, Math.round(numberParam(searchParams.get("limit")) ?? 10)));

  if (lat == null || lon == null || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return NextResponse.json(
      { error: "Valid lat and lon are required." },
      { status: 400 },
    );
  }

  if (radius <= 0 || radius > 100) {
    return NextResponse.json(
      { error: "radius must be between 0 and 100 km." },
      { status: 400 },
    );
  }

  return NextResponse.json(
    await nearbyDiesel(lat, lon, radius, limit),
    { headers: { "Cache-Control": "no-store" } },
  );
}
