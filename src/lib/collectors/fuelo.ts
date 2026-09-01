import type { IncomingPrice } from "@/lib/domain";
import type { PriceCollector } from "./types";

type FueloGasStationMarker = {
  id: string | null;
  lat: string;
  lon: string;
  logo?: string | null;
  cluster_count?: string | null;
};

type FueloBoundsResponse = {
  status: string;
  count: number;
  count_all?: number;
  gasstations?: FueloGasStationMarker[];
};

type FueloInfoResponse = {
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

const BULGARIA_BOUNDS: Omit<Bounds, "depth"> = {
  latMin: 41.35,
  latMax: 44.25,
  lonMin: 22.35,
  lonMax: 28.65,
  zoom: 8,
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function parseNumber(value: string | null | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBrand(logo: string | null | undefined): string | undefined {
  if (!logo) return undefined;

  const brands: Record<string, string> = {
    lukoil: "Lukoil",
    petrol: "Petrol",
    omv: "OMV",
    shell: "Shell",
    eko: "EKO",
    rompetrol: "Rompetrol",
    apid2000: "APID 2000",
    insa: "INSA OIL",
  };

  return brands[logo.toLowerCase()] ?? logo;
}

function decodeHtml(value: string): string {
  return value
    .replace(/\\\//g, "/")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractFirst(pattern: RegExp, html: string): string | null {
  const match = html.match(pattern);
  return match?.[1] ? decodeHtml(match[1]) : null;
}

function parseInfoWindow(
  marker: FueloGasStationMarker,
  info: FueloInfoResponse,
): IncomingPrice[] {
  if (info.status !== "OK" || !info.text) return [];

  const html = info.text;
  const name = extractFirst(/<h4[^>]*>([\s\S]*?)<\/h4>/i, html);
  const location = extractFirst(/<h5[^>]*>([\s\S]*?)<\/h5>/i, html);

  if (!name || !location) return [];

  const locationParts = location
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const city = locationParts[locationParts.length - 1] ?? "България";
  const address = locationParts.slice(1).join(", ") || city;
  const brand = normalizeBrand(marker.logo);

  const observedAt = new Date();
  const results: IncomingPrice[] = [];

  const fuelPatterns: Array<{
    fuel: IncomingPrice["fuel"];
    regex: RegExp;
  }> = [
    { fuel: "DIESEL", regex: /title=["']Diesel:\s*([0-9]+(?:[.,][0-9]+)?)\s*€\/л/i },
    { fuel: "GASOLINE_95", regex: /title=["']A95:\s*([0-9]+(?:[.,][0-9]+)?)\s*€\/л/i },
    { fuel: "LPG", regex: /title=["']LPG:\s*([0-9]+(?:[.,][0-9]+)?)\s*€\/л/i },
    { fuel: "CNG", regex: /title=["'](?:CNG|Methane):\s*([0-9]+(?:[.,][0-9]+)?)\s*€\/л/i },
  ];

  for (const { fuel, regex } of fuelPatterns) {
    const raw = html.match(regex)?.[1];
    const amount = parseNumber(raw);

    if (amount == null || amount <= 0) continue;

    results.push({
      station: {
        name,
        brand,
        address,
        city,
        latitude: parseNumber(marker.lat) ?? undefined,
        longitude: parseNumber(marker.lon) ?? undefined,
      },
      fuel,
      amount,
      currency: "EUR",
      observedAt,
      originalUrl: marker.id
        ? `https://bg.fuelo.net/gasstation/id/${marker.id}?lang=bg`
        : `https://bg.fuelo.net/gasstations?lang=bg`,
    });
  }

  return results;
}

async function fetchJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "User-Agent": "FuelTrackerBG/1.0",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Fuelo request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

async function fetchBounds(bounds: Bounds): Promise<FueloGasStationMarker[]> {
  const form = new URLSearchParams({
    lat_max: String(bounds.latMax),
    lon_max: String(bounds.lonMax),
    lat_min: String(bounds.latMin),
    lon_min: String(bounds.lonMin),
    zoom: String(bounds.zoom),
    country: "bg",
    fuel: "all",
    brand: "all",
  });

  const data = await fetchJson<FueloBoundsResponse>(MAP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: form,
  });

  if (data.status !== "OK") {
    throw new Error(`Fuelo bounds response status: ${data.status}`);
  }

  return data.gasstations ?? [];
}

function splitBounds(bounds: Bounds): Bounds[] {
  const latMid = (bounds.latMin + bounds.latMax) / 2;
  const lonMid = (bounds.lonMin + bounds.lonMax) / 2;
  const nextDepth = bounds.depth + 1;
  const nextZoom = Math.min(bounds.zoom + 2, 18);

  return [
    { latMin: bounds.latMin, latMax: latMid, lonMin: bounds.lonMin, lonMax: lonMid, zoom: nextZoom, depth: nextDepth },
    { latMin: bounds.latMin, latMax: latMid, lonMin: lonMid, lonMax: bounds.lonMax, zoom: nextZoom, depth: nextDepth },
    { latMin: latMid, latMax: bounds.latMax, lonMin: bounds.lonMin, lonMax: lonMid, zoom: nextZoom, depth: nextDepth },
    { latMin: latMid, latMax: bounds.latMax, lonMin: lonMid, lonMax: bounds.lonMax, zoom: nextZoom, depth: nextDepth },
  ];
}

async function discoverStations(maxDepth: number): Promise<FueloGasStationMarker[]> {
  const queue: Bounds[] = [{ ...BULGARIA_BOUNDS, depth: 0 }];
  const unique = new Map<string, FueloGasStationMarker>();

  while (queue.length) {
    const current = queue.shift()!;
    const markers = await fetchBounds(current);

    for (const marker of markers) {
      const clusterCount = Number(marker.cluster_count ?? 1);

      if (marker.id) {
        unique.set(marker.id, marker);
      }

      if (!Number.isFinite(clusterCount) || clusterCount <= 1) continue;
      if (current.depth >= maxDepth) continue;

      queue.push(...splitBounds(current));
      break;
    }

    if (queue.length) await sleep(150);
  }

  return [...unique.values()];
}

async function fetchStationPrices(
  markers: FueloGasStationMarker[],
  detailLimit: number,
  concurrency: number,
): Promise<IncomingPrice[]> {
  const selected = markers.slice(0, detailLimit);
  const results: IncomingPrice[] = [];
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= selected.length) return;

      const marker = selected[index];
      if (!marker.id) continue;

      try {
        const url = `${INFO_URL}/${encodeURIComponent(marker.id)}?lang=bg`;
        const info = await fetchJson<FueloInfoResponse>(url, { method: "GET" });
        results.push(...parseInfoWindow(marker, info));
      } catch (error) {
        console.warn(`Fuelo station ${marker.id} failed:`, error);
      }

      await sleep(120);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, selected.length) }, () => worker()),
  );

  return results;
}

export class FueloAdapter implements PriceCollector {
  name = "Fuelo";
  kind = "PRICE" as const;
  sourceKind = "HTML_PUBLIC" as const;
  baseUrl = MAP_URL;

  async collect(): Promise<IncomingPrice[]> {
    const maxDepth = Number(process.env.FUELO_DISCOVERY_DEPTH ?? 3);
    const detailLimit = Number(process.env.FUELO_DETAIL_LIMIT ?? 250);
    const concurrency = Number(process.env.FUELO_CONCURRENCY ?? 5);

    if (!Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > 5) {
      throw new Error("FUELO_DISCOVERY_DEPTH must be an integer between 0 and 5");
    }

    if (!Number.isInteger(detailLimit) || detailLimit < 1 || detailLimit > 500) {
      throw new Error("FUELO_DETAIL_LIMIT must be an integer between 1 and 500");
    }

    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 10) {
      throw new Error("FUELO_CONCURRENCY must be an integer between 1 and 10");
    }

    const markers = await discoverStations(maxDepth);
    const prices = await fetchStationPrices(markers, detailLimit, concurrency);

    console.info(
      `Fuelo discovered ${markers.length} individual stations and collected ${prices.length} price observations`,
    );

    return prices;
  }
}
