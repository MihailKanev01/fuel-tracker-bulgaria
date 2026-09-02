import { FuelType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type NearbyFuelStation = {
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
export type NearbyDieselStation = NearbyFuelStation;

type FueloMarker = { id: string | null; lat: string; lon: string; logo?: string | null; cluster_count?: string | null };
type FueloBoundsResponse = { status: string; gasstations?: FueloMarker[] };
type FueloInfoResponse = { status: string; text?: string };
type Bounds = { minLat: number; maxLat: number; minLon: number; maxLon: number; depth: number };

const FUELO_MAP_URL = "https://bg.fuelo.net/ajax/get_gasstations_within_bounds_mysql_clustering";
const FUELO_INFO_URL = "https://bg.fuelo.net/ajax/get_infowindow_content";
const asNumber = (value: { toNumber(): number } | null) => value?.toNumber() ?? null;

const FUELO_FUEL_FILTERS: Record<FuelType, string> = {
  DIESEL: "diesel",
  GASOLINE_95: "a95",
  GASOLINE_100: "a100",
  LPG: "lpg",
  CNG: "cng",
};

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
  return value.replace(/\\\\\//g, "/").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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
  const response = await fetch(url, { ...init, headers: { Accept: "application/json", "User-Agent": "FuelTrackerBG/1.0", ...(init.headers ?? {}) }, cache: "no-store", signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Fuelo request failed with ${response.status}`);
  return (await response.json()) as T;
}
async function fetchBoundsBox(bounds: Bounds, fuelFilter: string) {
  const form = new URLSearchParams({ lat_max: String(bounds.maxLat), lon_max: String(bounds.maxLon), lat_min: String(bounds.minLat), lon_min: String(bounds.minLon), zoom: String(bounds.depth === 0 ? 13 : Math.min(18, 13 + bounds.depth * 2)), country: "bg", fuel: fuelFilter, brand: "all" });
  return fueloJson<FueloBoundsResponse>(FUELO_MAP_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" }, body: form });
}
function radiusBounds(latitude: number, longitude: number, radiusKm: number): Bounds {
  const latDelta = radiusKm / 110.574;
  const lonDelta = radiusKm / (111.32 * Math.max(0.25, Math.cos((latitude * Math.PI) / 180)));
  return { minLat: latitude - latDelta, maxLat: latitude + latDelta, minLon: longitude - lonDelta, maxLon: longitude + lonDelta, depth: 0 };
}
async function fetchInfo(id: string): Promise<FueloInfoResponse> {
  let last: FueloInfoResponse = { status: "warning" };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await fueloJson<FueloInfoResponse>(`${FUELO_INFO_URL}/${encodeURIComponent(id)}?lang=bg`, { method: "GET" });
      last = result;
      if (result.status === "OK" && result.text) return result;
    } catch {}
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  return last;
}
function parseInfo(marker: FueloMarker, info: FueloInfoResponse, fuelType: FuelType) {
  if (info.status !== "OK" || !info.text || !marker.id) return null;
  const html = info.text;
  const name = extract(/<h4[^>]*>([\s\S]*?)<\/h4>/i, html);
  const location = extract(/<h5[^>]*>([\s\S]*?)<\/h5>/i, html);
  const labels: Record<FuelType, string[]> = {
    DIESEL: ["Diesel"],
    GASOLINE_95: ["A95", "A-95", "Gasoline 95"],
    GASOLINE_100: ["A100", "A-100", "A98+", "Gasoline 100"],
    LPG: ["LPG", "Autogas", "Propane-Butane"],
    CNG: ["CNG", "Methane", "Natural Gas"],
  };
  const price = labels[fuelType]
    .map((label) => html.match(new RegExp(`title=[\\\"']${label}:\\s*([0-9]+(?:[.,][0-9]+)?)`, "i"))?.[1])
    .map(parseNumber)
    .find((value): value is number => value != null && value > 0);
  const latitude = parseNumber(marker.lat);
  const longitude = parseNumber(marker.lon);
  if (!name || !location || price == null || latitude == null || longitude == null) return null;
  const parts = location.split(",").map((part) => part.trim()).filter(Boolean);
  return {
    id: `fuelo-${marker.id}`,
    name,
    brand: normalizeBrand(marker.logo),
    city: parts[parts.length - 1] ?? "България",
    address: parts.slice(1).join(", ") || parts[parts.length - 1] || "България",
    price,
    observedAt: new Date(),
    confidence: 75,
    sourceUrl: `https://bg.fuelo.net/gasstation/id/${encodeURIComponent(marker.id)}?lang=bg`,
    latitude,
    longitude,
    fuelType,
  };
}
function splitBounds(bounds: Bounds): Bounds[] {
  const midLat = (bounds.minLat + bounds.maxLat) / 2;
  const midLon = (bounds.minLon + bounds.maxLon) / 2;
  const depth = bounds.depth + 1;
  return [
    { minLat: bounds.minLat, maxLat: midLat, minLon: bounds.minLon, maxLon: midLon, depth },
    { minLat: bounds.minLat, maxLat: midLat, minLon: midLon, maxLon: bounds.maxLon, depth },
    { minLat: midLat, maxLat: bounds.maxLat, minLon: bounds.minLon, maxLon: midLon, depth },
    { minLat: midLat, maxLat: bounds.maxLat, minLon: midLon, maxLon: bounds.maxLon, depth },
  ];
}
async function discoverNearbyMarkers(latitude: number, longitude: number, radiusKm: number, fuelType: FuelType) {
  const unique = new Map<string, FueloMarker>();
  const fuelFilter = FUELO_FUEL_FILTERS[fuelType];
  const maxDepth = radiusKm <= 10 ? 4 : radiusKm <= 25 ? 3 : 2;
  const maxDiscovered = 2500;
  let queue: Bounds[] = [radiusBounds(latitude, longitude, radiusKm)];

  while (queue.length && unique.size < maxDiscovered) {
    const batch = queue.splice(0, Math.min(queue.length, 8));
    const responses = await Promise.allSettled([
      ...batch.map((box) => fetchBoundsBox(box, fuelFilter)),
      ...batch.map((box) => fetchBoundsBox(box, "all")),
    ]);

    let splitBoxes: Bounds[] = [];
    const allResponses = [
      ...responses.slice(0, batch.length),
      ...responses.slice(batch.length),
    ];
    for (let i = 0; i < batch.length; i += 1) {
      const box = batch[i];
      const specific = responses[i];
      const all = responses[batch.length + i];
      let dense = false;
      const consume = (response: PromiseSettledResult<FueloBoundsResponse>) => {
        if (response.status !== "fulfilled") return;
        for (const marker of response.value.gasstations ?? []) {
          if (marker.id) unique.set(marker.id, marker);
          if (!marker.id && Number(marker.cluster_count ?? 1) > 1) dense = true;
        }
      };
      consume(specific);
      consume(all);
      if (dense && box.depth < maxDepth) splitBoxes.push(...splitBounds(box));
    }
    if (!allResponses.length) splitBoxes = batch.filter((box) => box.depth < maxDepth).flatMap(splitBounds);
    queue = [...splitBoxes, ...queue];
  }

  return [...unique.values()];
}
async function liveFueloNearby(latitude: number, longitude: number, radiusKm: number, limit: number, fuelType: FuelType) {
  try {
    const markers = await discoverNearbyMarkers(latitude, longitude, radiusKm, fuelType);
    const candidates = markers.filter((marker) => {
      const lat = parseNumber(marker.lat);
      const lon = parseNumber(marker.lon);
      return lat != null && lon != null && haversineKm(latitude, longitude, lat, lon) <= radiusKm + 0.05;
    });
    const results: NearbyFuelStation[] = [];
    let cursor = 0;
    const worker = async () => {
      while (true) {
        const index = cursor++;
        if (index >= candidates.length) return;
        const marker = candidates[index];
        if (!marker.id) continue;
        try {
          const parsed = parseInfo(marker, await fetchInfo(marker.id), fuelType);
          if (!parsed) continue;
          results.push({
            id: parsed.id,
            name: parsed.name,
            brand: parsed.brand,
            city: parsed.city,
            address: parsed.address,
            price: parsed.price,
            observedAt: parsed.observedAt,
            confidence: parsed.confidence,
            sourceUrl: parsed.sourceUrl,
            latitude: parsed.latitude,
            longitude: parsed.longitude,
            distanceKm: Number(haversineKm(latitude, longitude, parsed.latitude, parsed.longitude).toFixed(2)),
          });
        } catch {}
      }
    };
    await Promise.all(Array.from({ length: Math.min(10, Math.max(1, candidates.length)) }, worker));
    return results.sort((a, b) => a.price - b.price || a.distanceKm - b.distanceKm).slice(0, limit);
  } catch {
    return [];
  }
}
async function databaseNearby(latitude: number, longitude: number, radiusKm: number, limit: number, fuelType: FuelType): Promise<NearbyFuelStation[]> {
  const stations = await prisma.station.findMany({ where: { active: true }, include: { prices: { where: { fuelType, anomaly: false }, orderBy: { observedAt: "desc" }, take: 1 } } });
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
export async function nearbyFuel(latitude: number, longitude: number, radiusKm = 25, limit = 10, fuelType: FuelType = "DIESEL") {
  const live = await liveFueloNearby(latitude, longitude, radiusKm, Math.max(limit, 1000), fuelType);
  const database = await databaseNearby(latitude, longitude, radiusKm, Math.max(limit, 1000), fuelType);
  const merged = new Map<string, NearbyFuelStation>();
  for (const station of [...database, ...live]) merged.set(station.id, station);
  return [...merged.values()].sort((a, b) => a.price - b.price || a.distanceKm - b.distanceKm).slice(0, Math.max(limit, 1000));
}
export async function nearbyDiesel(latitude: number, longitude: number, radiusKm = 25, limit = 10) { return nearbyFuel(latitude, longitude, radiusKm, limit, "DIESEL"); }
