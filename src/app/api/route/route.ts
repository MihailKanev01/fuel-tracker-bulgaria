import { NextResponse } from "next/server";

const DEFAULT_ROUTER = "https://router.project-osrm.org";

type Coordinate = { lat: number; lon: number };

function validCoordinate(value: unknown): value is Coordinate {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Coordinate>;
  return typeof item.lat === "number" && Number.isFinite(item.lat) && item.lat >= -90 && item.lat <= 90
    && typeof item.lon === "number" && Number.isFinite(item.lon) && item.lon >= -180 && item.lon <= 180;
}

export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { origin?: unknown; destination?: unknown };
    if (!validCoordinate(body.origin) || !validCoordinate(body.destination)) {
      return NextResponse.json({ error: "Невалидни координати за маршрута." }, { status: 400 });
    }

    const routerBase = (process.env.ROUTING_URL || DEFAULT_ROUTER).replace(/\/$/, "");
    const origin = body.origin as Coordinate;
    const destination = body.destination as Coordinate;
    const coordinates = origin.lon + "," + origin.lat + ";" + destination.lon + "," + destination.lat;
    const url = routerBase + "/route/v1/driving/" + coordinates + "?overview=full&geometries=geojson&steps=false";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" }, cache: "no-store" });
    } finally {
      clearTimeout(timeout);
    }

    const payload = (await response.json().catch(() => null)) as {
      code?: string;
      routes?: Array<{
        distance?: number;
        duration?: number;
        geometry?: { type?: string; coordinates?: Array<[number, number]> };
      }>;
    } | null;

    const route = payload?.routes?.[0];
    const geometry = route?.geometry;
    if (!response.ok || payload?.code !== "Ok" || !route || geometry?.type !== "LineString" || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) {
      console.error("Detailed routing provider error:", response.status, payload?.code);
      return NextResponse.json({ error: "Подробният маршрут временно не е наличен." }, { status: 502 });
    }

    const safeCoordinates = geometry.coordinates.filter((pair) =>
      Array.isArray(pair) && pair.length >= 2 && Number.isFinite(pair[0]) && Number.isFinite(pair[1]),
    );

    if (safeCoordinates.length < 2) {
      return NextResponse.json({ error: "Маршрутът не съдържа валидна геометрия." }, { status: 502 });
    }

    return NextResponse.json({
      distanceKm: typeof route.distance === "number" ? route.distance / 1000 : null,
      durationMin: typeof route.duration === "number" ? route.duration / 60 : null,
      geometry: safeCoordinates,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Detailed routing route error:", error);
    return NextResponse.json({ error: "Не успяхме да изчислим подробния маршрут." }, { status: 500 });
  }
}
