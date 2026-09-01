import { NextResponse } from "next/server";
import { liveNearbyDiesel } from "@/lib/fuelo-live";
import { nearbyDiesel } from "@/lib/nearby";

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
    return NextResponse.json({ error: "Valid lat and lon are required." }, { status: 400 });
  }

  if (radius <= 0 || radius > 100) {
    return NextResponse.json({ error: "radius must be between 0 and 100 km." }, { status: 400 });
  }

  try {
    // Prefer a live Fuelo lookup so the nearby table is based on the freshest
    // publicly available price we can retrieve at request time.
    const live = await liveNearbyDiesel(lat, lon, radius, limit);
    if (live.length > 0) {
      return NextResponse.json(live, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    // Fallback to the latest observations already persisted in Neon.
    return NextResponse.json(await nearbyDiesel(lat, lon, radius, limit), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Live nearby prices error:", error);

    try {
      return NextResponse.json(await nearbyDiesel(lat, lon, radius, limit), {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (fallbackError) {
      console.error("Nearby fallback error:", fallbackError);
      return NextResponse.json({ error: "Unable to load nearby prices." }, { status: 500 });
    }
  }
}
