import type { NearbyDieselStation } from "@/lib/nearby";

type Marker = {
  id: string | null;
  lat: string;
  lon: string;
  logo?: string | null;
  cluster_count?: string | null;
};

type BoundsResponse = { status: string; gasstations?: Marker[] };
type InfoResponse = { status: string; text?: string };
type Bounds = { latMin: number; latMax: number; lonMin: number; lonMax: number; zoom: number; depth: number };

const MAP_URL = "https://bg.fuelo.net/ajax/get_gasstations_within_bounds_mysql_clustering";
const INFO_URL = "https://bg.fuelo.net/ajax/get_infowindow_content";
const EARTH_RADIUS_KM = 6371;

function toNumber(value: string | null | undefined) {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180)
    * Math.cos((lat2 * Math.PI) / 180)
    * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeText(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function textBetween(html: string, tag: "h4" | "h5") {
  const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  return normalizeText(html.match(pattern)?.[1] ?? "");
}

function brand(logo: string | null | undefined) {
  if (!logo) return null;
  const brands: Record<string, string> = {
    lukoil: "Lukoil",
    petrol: "Petrol",
    omv: "OMV",
    shell: "Shell",
    eko: "EKO",
    rompetrol: "Rompetrol",
    apid2000: "APID 2000",
    insa: "INSA OIL",
    "ek-petrol": "EK Petrol",
  };
  const key = logo.toLowerCase();
  return brands[key] ?? (key === "gasstation" ? null : logo);
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "User-Agent": "FuelTrackerBG/1.0",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`Fuelo returned ${response.status}`);
  return (await response.json()) as T;
}

async function fetchBounds(bounds: Bounds) {
  const form = new URLSearchParams({
    lat_max: String(bounds.latMax),
    lon_max: String(bounds.lonMax),
    lat_min: String(bounds.latMin),
    lon_min: String(bounds.lonMin),
    zoom: String(bounds.zoom),
    country: "bg",
    fuel: "diesel",
    brand: "all",
  });
  return fetchJson<BoundsResponse>(MAP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: form,
  });
}

function splitBounds(bounds: Bounds): Bounds[] {
  const midLat = (bounds.latMin + bounds.latMax) / 2;
  const midLon = (bounds.lonMin + bounds.lonMax) / 2;
  const depth = bounds.depth + 1;
  const zoom = Math.min(18, bounds.zoom + 2);
  return [
    { latMin: bounds.latMin, latMax: midLat, lonMin: bounds.lonMin, lonMax: midLon, zoom, depth },
    { latMin: bounds.latMin, latMax: midLat, lonMin: midLon, lonMax: bounds.lonMax, zoom, depth },
    { latMin: midLat, latMax: bounds.latMax, lonMin: bounds.lonMin, lonMax: midLon, zoom, depth },
    { latMin: midLat, latMax: bounds.latMax, lonMin: midLon, lonMax: bounds.lonMax, zoom, depth },
  ];
}

async function discoverNearbyMarkers(latitude: number, longitude: number, radiusKm: number) {
  const latDelta = radiusKm / 110.574;
  const lonDelta = radiusKm / (111.32 * Math.max(0.25, Math.cos(latitude * Math.PI / 180)));
  const queue: Bounds[] = [{
    latMin: latitude - latDelta,
    latMax: latitude + latDelta,
    lonMin: longitude - lonDelta,
    lonMax: longitude + lonDelta,
    zoom: radiusKm <= 5 ? 13 : radiusKm <= 10 ? 12 : 11,
    depth: 0,
  }];
  const unique = new Map<string, Marker>();
  const maxDepth = radiusKm <= 5 ? 4 : radiusKm <= 25 ? 3 : 2;

  while (queue.length && unique.size < 2500) {
    const current = queue.shift()!;
    try {
      const response = await fetchBounds(current);
      let dense = false;
      for (const marker of response.gasstations ?? []) {
        if (marker.id) unique.set(marker.id, marker);
        if (!marker.id && Number(marker.cluster_count ?? 1) > 1) dense = true;
      }
      if (dense && current.depth < maxDepth) queue.push(...splitBounds(current));
    } catch {
      if (current.depth < maxDepth) queue.push(...splitBounds(current));
    }
  }

  return [...unique.values()]
    .map((marker) => ({ marker, latitude: toNumber(marker.lat), longitude: toNumber(marker.lon) }))
    .filter((item) => item.latitude != null && item.longitude != null)
    .map((item) => ({ ...item, distanceKm: distanceKm(latitude, longitude, item.latitude!, item.longitude!) }))
    .filter((item) => item.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

export async function liveNearbyDiesel(
  latitude: number,
  longitude: number,
  radiusKm = 25,
  limit = 10,
): Promise<NearbyDieselStation[]> {
  const markers = await discoverNearbyMarkers(latitude, longitude, radiusKm);
  const output: NearbyDieselStation[] = [];
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= markers.length) return;
      const item = markers[index];
      if (!item.marker.id) continue;

      try {
        const info = await fetchJson<InfoResponse>(`${INFO_URL}/${encodeURIComponent(item.marker.id)}?lang=bg`);
        if (info.status !== "OK" || !info.text) continue;
        const name = textBetween(info.text, "h4");
        const location = textBetween(info.text, "h5");
        const priceMatch = info.text.match(/title=["']Diesel:\s*([0-9]+(?:[.,][0-9]+)?)\s*€\/л/i);
        const price = toNumber(priceMatch?.[1]);
        if (!name || !location || price == null) continue;

        const parts = location.split(",").map((part) => part.trim()).filter(Boolean);
        output.push({
          id: item.marker.id,
          name,
          brand: brand(item.marker.logo),
          city: parts.at(-1) ?? "България",
          address: parts.slice(1).join(", ") || parts.at(-1) || "България",
          price,
          observedAt: new Date(),
          confidence: 70,
          sourceUrl: `https://bg.fuelo.net/gasstation/id/${encodeURIComponent(item.marker.id)}?lang=bg`,
          latitude: item.latitude!,
          longitude: item.longitude!,
          distanceKm: Number(item.distanceKm.toFixed(2)),
        });
      } catch {
        // One failed station must not break the complete nearby result set.
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(10, Math.max(1, markers.length)) }, worker));

  return output
    .sort((a, b) => a.price - b.price || a.distanceKm - b.distanceKm)
    .slice(0, Math.max(limit, 1000));
}
