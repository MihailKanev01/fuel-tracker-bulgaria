"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FUEL_OPTIONS, fuelLabel, type FuelKey } from "@/lib/fuel";

export type Overview = {
  average: number | null;
  lowest: number | null;
  highest: number | null;
  median: number | null;
  stationCount: number;
  sourceCount: number;
  confidence: number | null;
  latest: string | null;
};

export type Point = {
  date: string;
  average: number;
  minimum: number;
  maximum: number;
};

export type Station = {
  id: string;
  name: string;
  brand: string | null;
  city: string;
  address: string;
  price: number;
  observedAt: string;
  confidence: number;
  sourceUrl: string;
  latitude: number | null;
  longitude: number | null;
};

export type NearbyStation = Station & { distanceKm: number };

export type Change = {
  id: string;
  station: string;
  city: string;
  oldPrice: number;
  newPrice: number;
  change: number;
  percent: number;
  detectedAt: string;
  sourceUrl: string;
};

export type NewsItem = {
  id: string;
  title: string;
  url: string;
  publisher: string;
  publishedAt: string;
  summary: string | null;
  impact: "GOOD" | "BAD" | "NEUTRAL" | null;
};

const SHARED_NEWS_TERMS = [
  "петрол", "brent", "opec", "горив", "рафин", "суров",
  "crude", "oil", "бензи", "енерг",
];

const FUEL_NEWS_TERMS: Record<FuelKey, string[]> = {
  diesel: ["дизел", "дизелов", "diesel", "газьол"],
  a95: ["a95", "a-95", "бензин", "бензин95", "95 окт", "gasoline", "petrol"],
  a100: ["a100", "a-100", "a98+", "100 окт", "бензин", "premium gasoline", "gasoline"],
  lpg: ["lpg", "пропан-бутан", "пропан бутан", "автогаз", "газ пропан", "пропан"],
  cng: ["cng", "метан", "природен газ", "natural gas", "compressed natural gas"],
};

function isRelevantNews(item: NewsItem, fuel: FuelKey) {
  const text = `${item.title} ${item.summary ?? ""}`.toLowerCase();
  return FUEL_NEWS_TERMS[fuel].some((term) => text.includes(term))
    || SHARED_NEWS_TERMS.some((term) => text.includes(term));
}

function uniqueNews(items: NewsItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Keep a useful HTTP-level error when the server did not return JSON.
  }

  if (!response.ok) {
    const message =
      typeof payload === "object"
      && payload !== null
      && "error" in payload
      && typeof payload.error === "string"
        ? payload.error
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

function getCurrentPosition(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Браузърът не поддържа геолокация."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        lat: position.coords.latitude,
        lon: position.coords.longitude,
      }),
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new Error("Достъпът до местоположението е отказан."));
        } else {
          reject(new Error("Не успяхме да получим местоположението."));
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  });
}

export function useDashboardData({
  fuel,
  period,
  radius,
}: {
  fuel: FuelKey;
  period: number;
  radius: number;
}) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [history, setHistory] = useState<Point[]>([]);
  const [nearby, setNearby] = useState<NearbyStation[]>([]);
  const [changes, setChanges] = useState<Change[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setDataError(null);

    Promise.allSettled([
      fetchJson<Overview>(`/api/fuels/${fuel}`, { signal: controller.signal }),
      fetchJson<Point[]>(`/api/fuels/${fuel}/history?days=${period}`, { signal: controller.signal }),
      fetchJson<Change[]>(`/api/prices/changes?fuel=${fuel}`, { signal: controller.signal }),
      fetchJson<NewsItem[]>("/api/news", { signal: controller.signal }),
    ])
      .then(([overviewResult, historyResult, changesResult, newsResult]) => {
        if (controller.signal.aborted) return;

        const failures: string[] = [];

        if (overviewResult.status === "fulfilled") setOverview(overviewResult.value);
        else failures.push("обобщението");

        if (historyResult.status === "fulfilled") {
          setHistory(Array.isArray(historyResult.value) ? historyResult.value : []);
        } else {
          failures.push("историята");
        }

        if (changesResult.status === "fulfilled") {
          setChanges(Array.isArray(changesResult.value) ? changesResult.value : []);
        } else {
          failures.push("промените");
        }

        if (newsResult.status === "fulfilled") {
          setNews(Array.isArray(newsResult.value) ? newsResult.value : []);
        } else {
          failures.push("новините");
        }

        if (failures.length > 0) {
          setDataError(`Неуспяхме да заредим: ${failures.join(", ")}. Останалите данни остават налични.`);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          console.error("Dashboard data loading error:", error);
          setDataError("Възникна проблем при зареждането на данните.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [fuel, period]);

  useEffect(() => {
    let active = true;
    setLocationLoading(true);

    getCurrentPosition()
      .then((position) => {
        if (!active) return;
        setCoords(position);
        setLocationError(null);
      })
      .catch((error: Error) => {
        if (!active) return;
        setLocationError(error.message);
      })
      .finally(() => {
        if (active) setLocationLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!coords) return;

    const controller = new AbortController();
    setNearbyLoading(true);
    setNearby([]);
    setLocationError(null);

    fetchJson<NearbyStation[]>(
      `/api/prices/nearby?lat=${encodeURIComponent(coords.lat)}&lon=${encodeURIComponent(coords.lon)}&radius=${radius}&limit=250&fuel=${fuel}`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted) {
          setNearby(Array.isArray(data) ? data : []);
        }
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          console.error("Nearby stations loading error:", error);
          setLocationError("Не успяхме да заредим близките станции.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setNearbyLoading(false);
      });

    return () => controller.abort();
  }, [coords, radius, fuel]);

  const refreshLocation = useCallback(() => {
    setLocationLoading(true);
    setLocationError(null);

    getCurrentPosition()
      .then((position) => setCoords(position))
      .catch((error: Error) => setLocationError(error.message))
      .finally(() => setLocationLoading(false));
  }, []);

  const { goodNews, badNews } = useMemo(() => {
    const relevantNews = uniqueNews(
      news.filter((item) => isRelevantNews(item, fuel)),
    ).sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );

    return {
      goodNews: relevantNews.filter((item) => item.impact === "GOOD").slice(0, 4),
      badNews: relevantNews.filter((item) => item.impact === "BAD").slice(0, 4),
    };
  }, [news, fuel]);

  return {
    overview,
    history,
    nearby,
    changes,
    news,
    goodNews,
    badNews,
    coords,
    locationLoading,
    nearbyLoading,
    locationError,
    loading,
    dataError,
    refreshLocation,
    fuelLabel: fuelLabel(fuel),
    fuelOptions: FUEL_OPTIONS,
  };
}
