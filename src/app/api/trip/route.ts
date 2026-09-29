import { NextResponse } from "next/server";
import { FuelType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const DEFAULT_ROUTER = "https://router.project-osrm.org";
const ALIASES: Record<string, FuelType> = { diesel: "DIESEL", a95: "GASOLINE_95", a100: "GASOLINE_100", lpg: "LPG", cng: "CNG" };
type Coord = { lat: number; lon: number };
type StationCandidate = { id: string; name: string; brand: string | null; city: string; address: string; price: number; observedAt: Date; latitude: number; longitude: number; };

function validCoord(value: unknown): value is Coord {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Coord>;
  return typeof item.lat === "number" && Number.isFinite(item.lat) && item.lat >= -90 && item.lat <= 90 && typeof item.lon === "number" && Number.isFinite(item.lon) && item.lon >= -180 && item.lon <= 180;
}

function haversineKm(a: Coord, b: Coord) {
  const r = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function simplifyLine(line: Array<[number, number]>, maxPoints = 120) {
  if (line.length <= maxPoints) return line;
  const step = (line.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, index) => line[Math.round(index * step)]);
}

function pointToRouteKm(point: Coord, route: Array<[number, number]>) {
  if (!route.length) return Infinity;
  let best = Infinity;
  const step = Math.max(1, Math.floor(route.length / 200));
  for (let i = 0; i < route.length; i += step) {
    const [lon, lat] = route[i];
    const distance = haversineKm(point, { lat, lon });
    if (distance < best) best = distance;
  }
  const last = route[route.length - 1];
  if (last) best = Math.min(best, haversineKm(point, { lat: last[1], lon: last[0] }));
  return best;
}

function routeRequestUrl(base: string, coordinates: Coord[]) {
  const path = coordinates.map((item) => item.lon + "," + item.lat).join(";");
  return base + "/route/v1/driving/" + path + "?overview=full&geometries=geojson&steps=false";
}

async function fetchRoute(base: string, coordinates: Coord[]) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(routeRequestUrl(base, coordinates), { signal: controller.signal, headers: { Accept: "application/json" }, cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as { code?: string; routes?: Array<{ distance?: number; duration?: number; geometry?: { type?: string; coordinates?: Array<[number, number]> } }> } | null;
    const route = payload?.routes?.[0];
    if (!response.ok || payload?.code !== "Ok" || !route || typeof route.distance !== "number" || typeof route.duration !== "number" || route.geometry?.type !== "LineString" || !Array.isArray(route.geometry.coordinates)) return null;
    const geometry = route.geometry.coordinates.filter((pair) => Array.isArray(pair) && pair.length >= 2 && Number.isFinite(pair[0]) && Number.isFinite(pair[1]));
    if (geometry.length < 2) return null;
    return { distanceKm: route.distance / 1000, durationMin: route.duration / 60, geometry: simplifyLine(geometry) };
  } finally {
    clearTimeout(timeout);
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { origin?: unknown; destination?: unknown; fuel?: unknown; quantity?: unknown; consumption?: unknown };
    if (!validCoord(body.origin) || !validCoord(body.destination)) return NextResponse.json({ error: "Въведи валидни начална и крайна точка." }, { status: 400 });

    const fuel = typeof body.fuel === "string" ? ALIASES[body.fuel.toLowerCase()] : undefined;
    if (!fuel) return NextResponse.json({ error: "Невалиден тип гориво." }, { status: 400 });
    const quantity = typeof body.quantity === "number" && Number.isFinite(body.quantity) ? Math.min(120, Math.max(5, body.quantity)) : 50;
    const consumption = typeof body.consumption === "number" && Number.isFinite(body.consumption) ? Math.min(30, Math.max(3, body.consumption)) : 7;

    const routerBase = (process.env.ROUTING_URL || DEFAULT_ROUTER).replace(/\/$/, "");
    const origin = body.origin as Coord;
    const destination = body.destination as Coord;
    const baseRoute = await fetchRoute(routerBase, [origin, destination]);
    if (!baseRoute) return NextResponse.json({ error: "Не успяхме да изчислим основния маршрут." }, { status: 502 });

    const allStations = await prisma.station.findMany({
      where: { active: true },
      include: { prices: { where: { fuelType: fuel, anomaly: false }, orderBy: { observedAt: "desc" }, take: 1 } },
    });

    const routePoints = baseRoute.geometry;
    const candidates: Array<StationCandidate & { corridorKm: number }> = [];
    for (const station of allStations) {
      const latitude = station.latitude?.toNumber() ?? null;
      const longitude = station.longitude?.toNumber() ?? null;
      const price = station.prices[0];
      if (latitude == null || longitude == null || !price) continue;
      const corridorKm = pointToRouteKm({ lat: latitude, lon: longitude }, routePoints);
      if (corridorKm > 8) continue;
      candidates.push({ id: station.id, name: station.name, brand: station.brand, city: station.city, address: station.address, price: price.priceEur.toNumber(), observedAt: price.observedAt, latitude, longitude, corridorKm });
    }

    candidates.sort((a, b) => a.corridorKm - b.corridorKm || a.price - b.price);
    const selected = candidates.slice(0, 8);

    const routeResults = await Promise.allSettled(selected.map(async (station) => {
      const via = await fetchRoute(routerBase, [origin, { lat: station.latitude, lon: station.longitude }, destination]);
      if (!via) return null;
      const detourKm = Math.max(0, via.distanceKm - baseRoute.distanceKm);
      const detourMin = Math.max(0, via.durationMin - baseRoute.durationMin);
      const extraTravelCost = detourKm * (consumption / 100) * station.price;
      const fillCost = quantity * station.price;
      return {
        station: { ...station, observedAt: station.observedAt.toISOString() },
        route: via,
        detourKm,
        detourMin,
        extraTravelCost,
        fillCost,
        totalFuelActionCost: fillCost + extraTravelCost,
      };
    }));

    const alternatives = routeResults.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
    alternatives.sort((a, b) => a.totalFuelActionCost - b.totalFuelActionCost || a.station.price - b.station.price);

    return NextResponse.json({
      fuel,
      quantity,
      consumption,
      baseRoute,
      stationCount: alternatives.length,
      alternatives,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Trip planner error:", error);
    return NextResponse.json({ error: "Не успяхме да изчислим пътуването." }, { status: 500 });
  }
}
