"use client";

import { useEffect, useMemo, useState } from "react";
import type { NearbyStation } from "@/hooks/use-dashboard-data";

export type RouteInfo = { distanceKm: number; durationMin: number | null };
type RouteResponse = { routes: Array<{ id: string; distanceKm: number; durationMin: number | null }> };

export function useRouteMatrix(coords: { lat: number; lon: number } | null, stations: NearbyStation[]) {
  const [routes, setRoutes] = useState<Record<string, RouteInfo>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = useMemo(() => {
    const byDistance = [...stations].sort((a, b) => a.distanceKm - b.distanceKm);
    const byPrice = [...stations].sort((a, b) => a.price - b.price);
    const result: NearbyStation[] = [];
    const seen = new Set<string>();
    for (const station of [...byDistance.slice(0, 10), ...byPrice.slice(0, 10)]) {
      if (seen.has(station.id) || station.latitude == null || station.longitude == null) continue;
      seen.add(station.id);
      result.push(station);
    }
    return result.slice(0, 20);
  }, [stations]);

  const signature = useMemo(() => candidates.map((s) => s.id).join(","), [candidates]);

  useEffect(() => {
    if (!coords || candidates.length === 0) {
      setRoutes({});
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch("/api/routing", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        origin: coords,
        destinations: candidates.map((station) => ({ id: station.id, lat: station.latitude, lon: station.longitude })),
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as RouteResponse | { error?: string } | null;
        if (!response.ok) {
          throw new Error(data && "error" in data && typeof data.error === "string" ? data.error : "Маршрутът не е наличен.");
        }
        return data as RouteResponse;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        const next: Record<string, RouteInfo> = {};
        for (const item of data.routes ?? []) next[item.id] = { distanceKm: item.distanceKm, durationMin: item.durationMin };
        setRoutes(next);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error("Route matrix loading error:", err);
        setRoutes({});
        setError("Реалният пътен маршрут временно не е наличен.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [coords, signature]);

  return { routes, loading, error, candidateCount: candidates.length };
}
