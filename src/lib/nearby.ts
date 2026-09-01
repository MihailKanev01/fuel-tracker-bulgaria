import { prisma } from "@/lib/prisma";

export type NearbyDieselStation = {
  id: string;
  name: string;
  brand: string | null;
  city: string;
  address: string;
  price: number;
  observedAt: Date;
  confidence: number;
  sourceUrl: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
};

type FueloMarker = { id: string | null; lat: string; lon: string; logo?: string | null; cluster_count?: string | null };
type FueloBoundsResponse = { status: string; gasstations?: FueloMarker[] };
type FueloInfoResponse = { status: string; text?: string };

const FUELO_MAP_URL = "https://bg.fuelo.net/ajax/get_gasstations_within_bounds_mysql_clustering";
const FUELO_INFO_URL = "https://bg.fuelo.net/ajax/get_infowindow_content";

const asNumber = (value: { toNumber(): number } | null) => value?.toNumber() ?? null;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthRadiusKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseNumber(value: string | null | undefined) {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanHtml(value: string) {
  return value.replace(/\\\//g, "/").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extract(pattern: RegExp, html: string) {
  const match = html.match(pattern);
  return match?.[1] ? cleanHtml(match[1]) : null;
}

function normalizeBrand(logo: string | null | undefined) {
  if (!logo) return null;
  const brands: Record<string, string> = { lukoil: "Lukoil", petrol: "Petrol", omv: "OMV", shell: "Shell", eko: "EKO", rompetrol: "Rompetrol", apid2000: "APID 2000", insa: "INSA OIL", "ek-petrol": "EK Petrol" };
  return brands[logo.toLowerCase()] ?? (logo.toLowerCase() === "gasstation" ? null : logo);
}

async function fueloJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", "User-Agent": "FuelTrackerBG/1.0", ...(init.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`Fuelo request failed with ${response.status}`);
  return (await response.json()) as T;
}

async function fetchBounds(latitude: number, longitude: number, radiusKm: number, zoom: number) {
  const latDelta = radiusKm / 110.8;
  const lonDelta = radiusKm / (110.8 * Math.max(0.15, Math.cos((latitude * Math.PI) / 180)));
  const form = new URLSearchParams({
    lat_max: String(latitude + latDelta),
    lon_max: String(longitude + lonDelta),
    lat_min: String(latitude - latDelta),
    lon_min: String(longitude - lonDelta),
    zoom: String(zoom),
    country: "bg",
    fuel: "all",
    brand: "all",
  });
  return fueloJson<FueloBoundsResponse>(FUELO_MAP_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" }, body: form });
}

async function fetchInfo(id: string) {
  return fueloJson<FueloInfoResponse>(`${FUELO_INFO_URL}/${encodeURIComponent(id)}?lang=bg`, { method: "GET" });
}

function parseInfo(marker: FueloMarker, info: FueloInfoResponse) {
  if (info.status !== "OK" || !info.text || !marker.id) return null;
  const html = info.text;
  const name = extract(/<h4[^>]*>([\s\S]*?)<\/h4>/i, html);
  const location = extract(/<h5[^>]*>([\s\S]*?)<\/h5>/i, html);
  const diesel = parseNumber(html.match(/title=["']Diesel:\s*([0-9]+(?:[.,][0-9]+)?)\s*€\/л/i)?.[1]);
  const latitude = parseNumber(marker.lat);
  const longitude = parseNumber(marker.lon);
  if (!name || !location || diesel == null || diesel <= 0 || latitude == null || longitude == null) return null;
  const parts = location.split(",").map((part) => part.trim()).filter(Boolean);
  return {
    id: `fuelo-${marker.id}`,
    name,
    brand: normalizeBrand(marker.logo),
    city: parts[parts.length - 1] ?? "България",
    address: parts.slice(1).join(", ") || parts[parts.length - 1] || "България",
    price: diesel,
    observedAt: new Date(),
    confidence: 75,
    sourceUrl: `https://bg.fuelo.net/gasstation/id/${encodeURIComponent(marker.id)}?lang=bg`,
    latitude,
    longitude,
  };
}

async function discoverNearbyMarkers(latitude: number, longitude: number, radiusKm: number) {
  const first = await fetchBounds(latitude, longitude, radiusKm, 15);
  const unique = new Map<string, FueloMarker>();
  const queue = (first.gasstations ?? []).map((marker) => ({ marker, radiusKm, depth: 0 }));

  while (queue.length && unique.size < 250) {
    const { marker, radiusKm: currentRadius, depth } = queue.shift()!;
    const count = Number(marker.cluster_count ?? 1);
    if (marker.id) { unique.set(marker.id, marker); continue; }
    if (count > 1 && depth < 3) {
      const nextRadius = Math.max(currentRadius / 2, 1);
      const children = await Promise.allSettled([
        fetchBounds(marker.lat ? Number(marker.lat) : latitude, marker.lon ? Number(marker.lon) : longitude, nextRadius, 17),
        fetchBounds(latitude, longitude, nextRadius, 17),
      ]);
      for (const child of children) {
        if (child.status !== "fulfilled") continue;
        for (const item of child.value.gasstations ?? []) {
          if (item.id) unique.set(item.id, item);
          else if (Number(item.cluster_count ?? 1) > 1 && depth + 1 < 3) queue.push({ marker: item, radiusKm: nextRadius, depth: depth + 1 });
        }
      }
    }
  }
  return [...unique.values()];
}

async function liveFueloNearby(latitude: number, longitude: number, radiusKm: number, limit: number) {
  try {
    const markers = await discoverNearbyMarkers(latitude, longitude, radiusKm);
    const candidates = markers.filter((marker) => {
      const lat = parseNumber(marker.lat);
      const lon = parseNumber(marker.lon);
      return lat != null && lon != null && haversineKm(latitude, longitude, lat, lon) <= radiusKm + 0.5;
    });
    const results: NonNullable<ReturnType<typeof parseInfo>>[] = [];
    let cursor = 0;
    const worker = async () => {
      while (true) {
        const index = cursor++;
        if (index >= candidates.length) return;
        const marker = candidates[index];
        if (!marker.id) continue;
        try {
          const parsed = parseInfo(marker, await fetchInfo(marker.id));
          if (parsed) results.push(parsed);
        } catch {
          // Continue when one public station endpoint is unavailable.
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(6, candidates.length) }, worker));
    return results
      .map((station) => ({ ...station, distanceKm: Number(haversineKm(latitude, longitude, station.latitude, station.longitude).toFixed(2)) }))
      .sort((a, b) => a.price - b.price || a.distanceKm - b.distanceKm)
      .slice(0, limit);
  } catch {
    return [];
  }
}

async function databaseNearby(latitude: number, longitude: number, radiusKm = 25, limit = 10): Promise<NearbyDieselStation[]> {
  const stations = await prisma.station.findMany({ where: { active: true }, include: { prices: { where: { fuelType: "DIESEL", anomaly: false }, orderBy: { observedAt: "desc" }, take: 1 } } });
  return stations.flatMap((station) => {
    const stationLat = asNumber(station.latitude);
    const stationLon = asNumber(station.longitude);
    const price = station.prices[0];
    if (stationLat == null || stationLon == null || !price) return [];
    const distanceKm = haversineKm(latitude, longitude, stationLat, stationLon);
    if (distanceKm > radiusKm) return [];
    return [{ id: station.id, name: station.name, brand: station.brand, city: station.city, address: station.address, price: price.priceEur.toNumber(), observedAt: price.observedAt, confidence: price.confidence, sourceUrl: price.originalUrl, latitude: stationLat, longitude: stationLon, distanceKm: Number(distanceKm.toFixed(2)) }];
  }).sort((a, b) => a.price - b.price || a.distanceKm - b.distanceKm).slice(0, limit);
}

export async function nearbyDiesel(latitude: number, longitude: number, radiusKm = 25, limit = 10) {
  const live = await liveFueloNearby(latitude, longitude, radiusKm, limit);
  if (live.length) return live;
  return databaseNearby(latitude, longitude, radiusKm, limit);
}
