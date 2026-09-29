import { NextResponse } from "next/server";

const DEFAULT_ROUTER = "https://router.project-osrm.org";

type Coordinate = { lat: number; lon: number };
type Destination = Coordinate & { id: string };

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
    const body = (await request.json()) as { origin?: unknown; destinations?: unknown };
    if (!validCoordinate(body.origin)) {
      return NextResponse.json({ error: "Невалидно начално местоположение." }, { status: 400 });
    }

    if (!Array.isArray(body.destinations) || body.destinations.length === 0 || body.destinations.length > 20) {
      return NextResponse.json({ error: "Позволени са от 1 до 20 дестинации." }, { status: 400 });
    }

    const destinations = body.destinations.filter((item): item is Destination => {
      if (!item || typeof item !== "object") return false;
      const value = item as Partial<Destination>;
      return typeof value.id === "string" && value.id.length > 0 && validCoordinate(value);
    });

    if (destinations.length !== body.destinations.length) {
      return NextResponse.json({ error: "Една или повече станции имат невалидни координати." }, { status: 400 });
    }

    const routerBase = (process.env.ROUTING_URL || DEFAULT_ROUTER).replace(/\/$/, "");
    const coordinates = [body.origin, ...destinations] as Coordinate[];
    const encodedCoordinates = coordinates.map((item) => item.lon + "," + item.lat).join(";");
    const destinationIndexes = destinations.map((_, index) => index + 1).join(";");
    const url = routerBase + "/table/v1/driving/" + encodedCoordinates + "?sources=0&destinations=" + destinationIndexes + "&annotations=distance,duration";

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
      distances?: Array<Array<number | null>>;
      durations?: Array<Array<number | null>>;
    } | null;

    if (!response.ok || payload?.code !== "Ok" || !Array.isArray(payload.distances?.[0])) {
      console.error("Routing provider error:", response.status, payload?.code);
      return NextResponse.json({ error: "Маршрутът временно не е наличен." }, { status: 502 });
    }

    const distances = payload.distances[0];
    const durations = payload.durations?.[0] ?? [];
    const routes = destinations.map((destination, index) => {
      const distance = distances[index];
      const duration = durations[index];
      return {
        id: destination.id,
        distanceKm: typeof distance === "number" ? distance / 1000 : null,
        durationMin: typeof duration === "number" ? duration / 60 : null,
      };
    }).filter((item): item is { id: string; distanceKm: number; durationMin: number | null } => typeof item.distanceKm === "number" && Number.isFinite(item.distanceKm));

    return NextResponse.json({ routes }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Routing route error:", error);
    return NextResponse.json({ error: "Не успяхме да изчислим пътния маршрут." }, { status: 500 });
  }
}
