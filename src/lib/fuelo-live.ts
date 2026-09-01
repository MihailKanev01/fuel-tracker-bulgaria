import type { NearbyDieselStation } from "@/lib/nearby";

type Marker = {
  id: string | null;
  lat: string;
  lon: string;
  logo?: string | null;
  cluster_count?: string | null;
};

type BoundsResponse = {
  status: string;
  count?: number;
  gasstations?: Marker[];
};

type InfoResponse = {
  status: string;
  text?: string;
};

type Bounds = {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
  zoom: number;
  depth: number;
};

const MAP_URL = "https://bg.fuelo.net/ajax/get_gasstations_within_bounds_mysql_clustering";
const INFO_URL = "https://bg.fuelo.net/ajax/get_infowindow_content";
const EARTH_RADIUS_KM = 6371;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function number(value: string | null | undefined) {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function brand(logo: string | null | undefined) {
  const map: Record<string, string> = {
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
  if (!logo) return null;
  return map[logo.toLowerCase()] ?? (logo === "gasstation" ? null : logo);
}

function textBetween(html: string, tag: "h4" | "h5") {
  const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1]
    ?.replace(/\\\//g, "/")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\\s+/g, " ")
    .trim() ?? null;
}

function fuelPrice(html: string, label: string) {
  const match = html.match(new RegExp(`title=["']${label}:\\s*([0-9]+(?:[.,][0-9]+)?)\\s*€/л`, "i"));
  return number(match?.[1]);
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
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Fuelo returned ${response.status}`);
  return (await response.json()) as T;
}

async function fetchBounds(bounds: Bounds) {
  const body = new URLSearchParams({
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
    body,
  });
}

function splitBounds(bounds: Bounds): Bounds[] {
  const latMid = (bounds.latMin + bounds.latMax) / 2;
  const lonMid = (bounds.lonMin + bounds.lonMax) / 2;
  return [
    { latMin: bounds.latMin, latMax: latMid, lonMin: bounds.lonMin, lonMax: lonMid, zoom: Math.min(18, bounds.zoom + 2), depth: bounds.depth + 1 },
    { latMin: bounds.latMin, latMax: latMid, lonMin: lonMid, lonMax: bounds.lonMax, zoom: Math.min(18, bounds.zoom + 2), depth: bounds.depth + 1 },
    { latMin: latMid, latMax: bounds.latMax, lonMin: bounds.lonMin, lonMax: lonMid, zoom: Math.min(18, bounds.zoom + 2), depth: bounds.depth + 1 },
    { latMin: latMid, latMax: bounds.latMax, lonMin: lonMid, lonMax: bounds.lonMax, zoom: Math.min(18, bounds.zoom + 2), depth: bounds.depth + 1 },
  ];
}

async function discoverNearbyMarkers(latitude: number, longitude: number, radiusKm: number) {
  const latDelta = radiusKm / 110.574;
  const lonDelta = radiusKm / (111.32 * Math.max(0.25, Math.cos(latitude * Math.PI / 180)));
  const root: Bounds = {
    latMin: Math.max(-90, latitude - latDelta),
    latMax: Math.min(90, latitude + latDelta),
    lonMin: Math.max(-180, longitude - lonDelta),
    lonMax: Math.min(180, longitude + lonDelta),
    zoom: 11,
    depth: 0,
  };

  const queue = [root];
  const unique = new Map<string, Marker>();
  const maxDepth = 3;

  while (queue.length) {
    const current = queue.shift()!;
    let response: BoundsResponse;
    try {
      response = await fetchBounds(current);
    } catch (error) {
      if (current.depth < maxDepth) {
        queue.push(...splitBounds(current));
      }
      continue;
    }

    if (response.status !== "OK") {
      if (current.depth < maxDepth) queue.push(...splitBounds(current));
      continue;
    }

    let hasClusters = false;
    for (const marker of response.gasstations ?? []) {
      const clusterCount = Number(marker.cluster_count ?? 1);
      if (marker.id) unique.set(marker.id, marker);
      if (clusterCount > 1) hasClusters = true;
    }

    if (hasClusters && current.depth < maxDepth) queue.push(...splitBounds(current));
    if (queue.length) await sleep(80);
  }

  return [...unique.values()]
    .map((marker) => ({
      marker,
      latitude: number(marker.lat),
      longitude: number(marker.lon),
    }))
    .filter((item) => item.latitude != null && item.longitude != null)
    .map((item) => ({ ...item, distanceKm: distanceKm(latitude, longitude, item.latitude!, item.longitude!) }))
    .filter((item) => item.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

export async function liveNearbyDiesel(latitude: number, longitude: number, radiusKm = 25, limit = 10): Promise<NearbyDieselStation[]> {
  const markers = await discoverNearbyMarkers(latitude, longitude, radiusKm);
  const selected = markers.slice(0, Math.min(40, Math.max(limit * 3, 20)));
  const output: NearbyDieselStation[] = [];
  const checkedAt = new Date();
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= selected.length) return;
      const item = selected[index];
      if (!item.marker.id) continue;

      try {
        const info = await fetchJson<InfoResponse>(`${INFO_URL}/${encodeURIComponent(item.marker.id)}?lang=bg`);
        if (info.status !== "OK" || !info.text) continue;

        const name = textBetween(info.text, "h4");
        const location = textBetween(info.text, "h5");
        const price = fuelPrice(info.text, "Diesel");
        if (!name || !location || price == null) continue;

        const parts = location.split(",").map((part) => part.trim()).filter(Boolean);
        output.push({
          id: item.marker.id,
          name,
          brand: brand(item.marker.logo),
          city: parts.at(-1) ?? "България",
          address: parts.slice(1).join(", ") || (parts.at(-1) ?? "България"),
          price,
          observedAt: checkedAt,
          confidence: 70,
          sourceUrl: `https://bg.fuelo.net/gasstation/id/${encodeURIComponent(item.marker.id)}?lang=bg`,
          latitude: item.latitude!,
          longitude: item.longitude!,
          distanceKm: Number(item.distanceKm.toFixed(2)),
        });
      } catch {
        // One unavailable station must not break the nearby result set.
      }

      await sleep(100);
    }
  }

  await Promise.all(Array.from({ length: Math.min(5, selected.length) }, () => worker()));

  return output
    .sort((a, b) => a.price - b.price || a.distanceKm - b.distanceKm)
    .slice(0, limit);
}
