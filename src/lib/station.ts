import { FuelType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type StationHistoryPoint = {
  date: string;
  average: number;
  minimum: number;
  maximum: number;
  observations: number;
};

export type StationDetail = {
  id: string;
  name: string;
  brand: string | null;
  city: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  fuelType: FuelType;
  fuelLabel: string;
  price: number | null;
  observedAt: string | null;
  confidence: number | null;
  sourceUrl: string | null;
  history: StationHistoryPoint[];
  liveOnly: boolean;
};

const labels: Record<FuelType, string> = {
  DIESEL: "Diesel",
  GASOLINE_95: "A95",
  GASOLINE_100: "A100",
  LPG: "LPG",
  CNG: "CNG",
};

function number(value: unknown) {
  if (value == null) return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanHtml(value: string) {
  return value
    .replace(/\\\\\//g, "/")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extract(pattern: RegExp, html: string) {
  const match = html.match(pattern);
  return match?.[1] ? cleanHtml(match[1]) : null;
}

function parsePrice(html: string, patterns: RegExp[]) {
  const titleValues = Array.from(
    html.matchAll(/\btitle\s*=\s*["']([^"']+)["']/gi),
    (match) => cleanHtml(match[1]),
  );
  const sources = [...titleValues, cleanHtml(html)];

  for (const source of sources) {
    for (const pattern of patterns) {
      const match = source.match(pattern);
      const value = number(match?.[1]);
      if (value != null && value > 0) return value;
    }
  }
  return null;
}

const fuelPatterns: Record<FuelType, RegExp[]> = {
  DIESEL: [/\b(?:Diesel|Дизел)\s*[:\-]\s*([0-9]+(?:[.,][0-9]+)?)/i],
  GASOLINE_95: [/\b(?:A95|A-95|Gasoline 95|Бензин 95|95)\s*[:\-]\s*([0-9]+(?:[.,][0-9]+)?)/i],
  GASOLINE_100: [/\b(?:A100|A-100|A98\+|Gasoline 100|Бензин 100|100)\s*[:\-]\s*([0-9]+(?:[.,][0-9]+)?)/i],
  LPG: [/\b(?:LPG|Autogas|Propane-Butane|Пропан-Бутан|Газ)\s*[:\-]\s*([0-9]+(?:[.,][0-9]+)?)/i],
  CNG: [/\b(?:CNG|Methane|Metan|Natural Gas|Метан)\s*[:\-]\s*([0-9]+(?:[.,][0-9]+)?)/i],
};

async function getFueloStation(id: string, fuelType: FuelType): Promise<StationDetail | null> {
  const markerId = id.startsWith("fuelo-") ? id.slice("fuelo-".length) : id;
  if (!markerId) return null;

  const response = await fetch(
    "https://bg.fuelo.net/ajax/get_infowindow_content/" + encodeURIComponent(markerId) + "?lang=bg",
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "FuelTrackerBG/1.0",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    },
  );
  if (!response.ok) return null;

  const payload = (await response.json()) as { status?: string; text?: string };
  if (payload.status !== "OK" || !payload.text) return null;

  const name = extract(/<h4[^>]*>([\s\S]*?)<\/h4>/i, payload.text);
  const location = extract(/<h5[^>]*>([\s\S]*?)<\/h5>/i, payload.text);
  if (!name || !location) return null;

  const parts = location.split(",").map((part) => part.trim()).filter(Boolean);
  const selected = parsePrice(payload.text, fuelPatterns[fuelType]);
  const lat = number(extract(/(?:lat|latitude)\s*[:=]\s*["']?(-?\d+(?:\.\d+)?)/i, payload.text));
  const lon = number(extract(/(?:lon|lng|longitude)\s*[:=]\s*["']?(-?\d+(?:\.\d+)?)/i, payload.text));

  return {
    id,
    name,
    brand: null,
    city: parts.at(-1) ?? "България",
    address: parts.slice(1).join(", ") || parts.at(-1) || "България",
    latitude: lat,
    longitude: lon,
    fuelType,
    fuelLabel: labels[fuelType],
    price: selected,
    observedAt: new Date().toISOString(),
    confidence: selected != null ? 70 : null,
    sourceUrl: "https://bg.fuelo.net/gasstation/id/" + encodeURIComponent(markerId) + "?lang=bg",
    history: [],
    liveOnly: true,
  };
}

export async function getStationDetail(id: string, fuelType: FuelType): Promise<StationDetail | null> {
  const station = await prisma.station.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      brand: true,
      city: true,
      address: true,
      latitude: true,
      longitude: true,
      prices: {
        where: {
          fuelType,
          anomaly: false,
          observedAt: { gte: new Date(Date.now() - 365 * 86_400_000) },
        },
        select: {
          priceEur: true,
          observedAt: true,
          confidence: true,
          originalUrl: true,
        },
        orderBy: { observedAt: "asc" },
      },
    },
  });

  if (station) {
    const latest = station.prices.at(-1);
    const grouped = new Map<string, number[]>();

    for (const item of station.prices) {
      const key = item.observedAt.toISOString().slice(0, 10);
      grouped.set(key, [...(grouped.get(key) ?? []), item.priceEur.toNumber()]);
    }

    const history = [...grouped].map(([date, values]) => ({
      date,
      average: values.reduce((sum, value) => sum + value, 0) / values.length,
      minimum: Math.min(...values),
      maximum: Math.max(...values),
      observations: values.length,
    }));

    return {
      id: station.id,
      name: station.name,
      brand: station.brand,
      city: station.city,
      address: station.address,
      latitude: station.latitude?.toNumber() ?? null,
      longitude: station.longitude?.toNumber() ?? null,
      fuelType,
      fuelLabel: labels[fuelType],
      price: latest?.priceEur.toNumber() ?? null,
      observedAt: latest?.observedAt.toISOString() ?? null,
      confidence: latest?.confidence ?? null,
      sourceUrl: latest?.originalUrl ?? null,
      history,
      liveOnly: false,
    };
  }

  try {
    return await getFueloStation(id, fuelType);
  } catch (error) {
    console.error("Fuelo station detail error:", error);
    return null;
  }
}
