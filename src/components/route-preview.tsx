"use client";

import { useEffect, useState } from "react";
import type { FuelKey } from "@/lib/fuel";

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

type Station = {
  id: string;
  name: string;
  brand: string | null;
  city: string;
  address: string;
  price: number;
  latitude: number | null;
  longitude: number | null;
};

type RoutePayload = {
  distanceKm: number | null;
  durationMin: number | null;
  geometry: Array<[number, number]>;
};

declare global {
  interface Window { L?: any; }
}

function loadLeaflet() {
  return new Promise<any>((resolve, reject) => {
    if (window.L) return resolve(window.L);
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${LEAFLET_JS}"]`);
    const existingLink = document.querySelector<HTMLLinkElement>(`link[href="${LEAFLET_CSS}"]`);
    if (!existingLink) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(window.L));
      existingScript.addEventListener("error", () => reject(new Error("Leaflet failed to load")));
      return;
    }
    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error("Leaflet failed to load"));
    document.head.appendChild(script);
  });
}

function navigationUrls(station: Station) {
  const destination = station.latitude != null && station.longitude != null
    ? station.latitude + "," + station.longitude
    : station.name + ", " + station.address;

  return {
    google: "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(destination),
    waze: station.latitude != null && station.longitude != null
      ? "https://www.waze.com/ul?ll=" + station.latitude + "%2C" + station.longitude + "&navigate=yes"
      : "https://www.waze.com/ul?q=" + encodeURIComponent(destination) + "&navigate=yes",
    apple: "https://maps.apple.com/?daddr=" + encodeURIComponent(destination) + "&dirflg=d",
  };
}

const money = new Intl.NumberFormat("bg-BG", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
const distanceFmt = new Intl.NumberFormat("bg-BG", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function RoutePreview({
  station,
  coords,
  fuel,
  fuelLabel,
  consumption,
}: {
  station: Station;
  coords: { lat: number; lon: number } | null;
  fuel: FuelKey;
  fuelLabel: string;
  consumption: number;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState<RoutePayload | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open || !coords || station.latitude == null || station.longitude == null) return;

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch("/api/route", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        origin: coords,
        destination: { lat: station.latitude, lon: station.longitude },
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as RoutePayload | { error?: string } | null;
        if (!response.ok) throw new Error(data && "error" in data && typeof data.error === "string" ? data.error : "Маршрутът не е наличен.");
        return data as RoutePayload;
      })
      .then((data) => { if (!controller.signal.aborted) setRoute(data); })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setRoute(null);
        setError(err instanceof Error ? err.message : "Маршрутът не е наличен.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [open, coords, station.latitude, station.longitude]);

  useEffect(() => {
    if (!open || !route || route.geometry.length < 2) return;
    let cancelled = false;
    let map: any = null;

    loadLeaflet().then((L) => {
      if (cancelled) return;
      const element = document.getElementById("route-preview-map-" + station.id);
      if (!element) return;
      map = L.map(element, { zoomControl: true, attributionControl: true, scrollWheelZoom: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      const points = route.geometry.map(([lon, lat]) => [lat, lon]);
      const line = L.polyline(points, { color: "#c8f65b", weight: 6, opacity: 0.92 });
      line.addTo(map);
      L.circleMarker([coords!.lat, coords!.lon], { radius: 8, color: "#0b1110", weight: 3, fillColor: "#4da3ff", fillOpacity: 1 }).addTo(map).bindTooltip("Ти", { direction: "top" });
      L.circleMarker([station.latitude!, station.longitude!], { radius: 8, color: "#0b1110", weight: 3, fillColor: "#c8f65b", fillOpacity: 1 }).addTo(map).bindTooltip("Станцията", { direction: "top" });
      map.fitBounds(line.getBounds().pad(0.18), { maxZoom: 15, animate: false });
      setTimeout(() => map.invalidateSize(), 80);
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? "Не успяхме да заредим картата." : "Не успяхме да заредим картата.");
    });

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [open, route, station.id, station.latitude, station.longitude, coords]);

  const routeCost = route?.distanceKm != null ? route.distanceKm * (consumption / 100) * station.price : null;
  const urls = navigationUrls(station);

  return (
    <>
      <button
        type="button"
        className="route-preview-button"
        disabled={!coords || station.latitude == null || station.longitude == null}
        onClick={() => { setOpen(true); setRoute(null); setError(null); }}
        title={!coords ? "Нужно е местоположение" : "Покажи реалния маршрут"}
      >
        🗺 Маршрут
      </button>

      {open ? (
        <div className="route-modal-backdrop" role="dialog" aria-modal="true" aria-label={"Маршрут до " + (station.brand ?? station.name)} onClick={() => setOpen(false)}>
          <div className="route-modal" onClick={(event) => event.stopPropagation()}>
            <div className="route-modal-head">
              <div>
                <span className="route-kicker">МАРШРУТ ОТ ТЕБ</span>
                <h3>{station.brand ?? station.name}</h3>
                <p>{station.address}, {station.city}</p>
              </div>
              <button type="button" className="route-modal-close" onClick={() => setOpen(false)} aria-label="Затвори">×</button>
            </div>

            {loading ? <div className="route-map-placeholder">◌ Изчисляваме реалния маршрут…</div> : null}
            {!loading && error ? <div className="route-map-placeholder route-map-error">◌ {error}</div> : null}
            {!loading && !error && route ? <div id={"route-preview-map-" + station.id} className="route-preview-map" /> : null}

            <div className="route-summary">
              <div><span>РАЗСТОЯНИЕ</span><strong>{route?.distanceKm != null ? distanceFmt.format(route.distanceKm) + " km" : "—"}</strong></div>
              <div><span>ВРЕМЕ</span><strong>{route?.durationMin != null ? Math.round(route.durationMin) + " мин" : "—"}</strong></div>
              <div><span>РАЗХОД</span><strong>{routeCost != null ? money.format(routeCost) : "—"}</strong><small>{fuelLabel} при {consumption.toFixed(1)} L/100</small></div>
            </div>

            <div className="route-navigation-links">
              <span>ОТВОРИ В</span>
              <a href={urls.google} target="_blank" rel="noreferrer">Google Maps →</a>
              <a href={urls.waze} target="_blank" rel="noreferrer">Waze →</a>
              <a href={urls.apple} target="_blank" rel="noreferrer">Apple Maps →</a>
            </div>

            <p className="route-modal-note">Маршрутът е изчислен от текущата ти позиция до координатите на станцията. Времето е ориентировъчно и може да се променя според трафика.</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
