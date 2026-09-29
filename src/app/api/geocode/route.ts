import { NextResponse } from "next/server";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const APP_USER_AGENT = "FuelTrackerBG/1.0 (fuel-tracker-bulgaria.vercel.app)";
const APP_REFERER = "https://fuel-tracker-bulgaria.vercel.app/";

type GeocodeResult = {
  lat: string;
  lon: string;
  display_name: string;
  type?: string;
  addresstype?: string;
};

const cache = new Map<string, { expiresAt: number; results: Array<{ lat: number; lon: number; label: string }> }>();
let lastRequestAt = 0;

function normalizeQuery(value: string) {
  return value.trim().replace(/\\s+/g, " ").slice(0, 160);
}

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { query?: unknown };
    const query = typeof body.query === "string" ? normalizeQuery(body.query) : "";

    if (query.length < 2) {
      return NextResponse.json({ error: "Въведи град или адрес." }, { status: 400 });
    }

    const key = query.toLocaleLowerCase("bg-BG");
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({ results: cached.results, cached: true });
    }

    const waitMs = Math.max(0, 1000 - (Date.now() - lastRequestAt));
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastRequestAt = Date.now();

    const url = new URL(NOMINATIM_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "5");
    url.searchParams.set("countrycodes", "bg");
    url.searchParams.set("addressdetails", "1");

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": APP_USER_AGENT,
        Referer: APP_REFERER,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    const payload = (await response.json().catch(() => [])) as GeocodeResult[];
    if (!response.ok || !Array.isArray(payload)) {
      return NextResponse.json({ error: "Търсенето на дестинация временно не е налично." }, { status: 502 });
    }

    const results = payload
      .map((item) => ({
        lat: Number(item.lat),
        lon: Number(item.lon),
        label: item.display_name,
      }))
      .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon) && item.label)
      .slice(0, 5);

    cache.set(key, { expiresAt: Date.now() + 10 * 60 * 1000, results });
    return NextResponse.json({ results, cached: false }, { headers: { "Cache-Control": "private, max-age=600" } });
  } catch (error) {
    console.error("Geocoding route error:", error);
    return NextResponse.json({ error: "Не успяхме да намерим дестинацията." }, { status: 500 });
  }
}
