"use client";

import { useEffect, useRef } from "react";

type Station = {
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
  distanceKm?: number;
};

declare global {
  interface Window {
    L?: any;
  }
}

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

function loadLeaflet() {
  return new Promise<any>((resolve, reject) => {
    if (window.L) {
      resolve(window.L);
      return;
    }

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

export function LocationMap({
  latitude,
  longitude,
  radiusKm,
  stations,
}: {
  latitude: number | null;
  longitude: number | null;
  radiusKm: number;
  stations: Station[];
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<any>(null);
  const layerRef = useRef<any>(null);

  useEffect(() => {
    if (latitude == null || longitude == null || !mapRef.current) return;

    let cancelled = false;

    loadLeaflet()
      .then((L) => {
        if (cancelled || !mapRef.current) return;

        if (!instanceRef.current) {
          const map = L.map(mapRef.current, {
            zoomControl: true,
            attributionControl: true,
            scrollWheelZoom: true,
          }).setView([latitude, longitude], radiusKm <= 5 ? 13 : radiusKm <= 10 ? 12 : radiusKm <= 25 ? 11 : 10);

          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap contributors',
          }).addTo(map);

          instanceRef.current = map;
          layerRef.current = L.layerGroup().addTo(map);
        }

        const map = instanceRef.current;
        const layer = layerRef.current;
        layer.clearLayers();

        const bounds = L.latLngBounds([[latitude, longitude]]);

        const currentMarker = L.circleMarker([latitude, longitude], {
          radius: 8,
          color: "#0b1110",
          weight: 3,
          fillColor: "#5db7ff",
          fillOpacity: 1,
        }).addTo(layer);
        currentMarker.bindTooltip("Твоето местоположение", { permanent: false, direction: "top" });

        L.circle([latitude, longitude], {
          radius: radiusKm * 1000,
          color: "#c8f65b",
          weight: 2,
          fillColor: "#c8f65b",
          fillOpacity: 0.08,
          dashArray: "6 6",
        }).addTo(layer);

        for (const station of stations) {
          if (station.latitude == null || station.longitude == null) continue;

          const marker = L.circleMarker([station.latitude, station.longitude], {
            radius: 6,
            color: "#0b1110",
            weight: 2,
            fillColor: "#c8f65b",
            fillOpacity: 0.95,
          }).addTo(layer);

          marker.bindPopup(
            `<strong>${escapeHtml(station.name)}</strong><br/>${escapeHtml(station.city)}<br/><b>${station.price.toFixed(3)} €/л</b>${station.distanceKm != null ? `<br/>${station.distanceKm.toFixed(2)} km` : ""}`,
          );
          bounds.extend([station.latitude, station.longitude]);
        }

        map.setView([latitude, longitude], radiusKm <= 5 ? 13 : radiusKm <= 10 ? 12 : radiusKm <= 25 ? 11 : 10);
        if (stations.length > 0) {
          map.fitBounds(bounds.pad(0.18), { maxZoom: radiusKm <= 5 ? 14 : 12, animate: false });
        }

        setTimeout(() => map.invalidateSize(), 50);
      })
      .catch((error) => {
        if (!cancelled) console.error("Location map error:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [latitude, longitude, radiusKm, stations]);

  useEffect(() => {
    return () => {
      instanceRef.current?.remove();
      instanceRef.current = null;
      layerRef.current = null;
    };
  }, []);

  if (latitude == null || longitude == null) {
    return (
      <div
        style={{
          height: 220,
          marginTop: 16,
          border: "1px solid #273530",
          borderRadius: 10,
          background: "linear-gradient(135deg,#141f1d,#101817)",
          display: "grid",
          placeItems: "center",
          textAlign: "center",
          color: "#778580",
          padding: 20,
          fontFamily: "DM Mono, monospace",
          fontSize: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 26, color: "#5f7169", marginBottom: 8 }}>◌</div>
          <p style={{ margin: 0 }}>Картата ще се покаже след получаване на местоположението.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "relative",
        height: 280,
        marginTop: 16,
        overflow: "hidden",
        border: "1px solid #273530",
        borderRadius: 10,
        background: "#111a18",
      }}
    >
      <div ref={mapRef} style={{ height: "100%", width: "100%" }} />
      <div
        style={{
          position: "absolute",
          left: 10,
          bottom: 10,
          zIndex: 500,
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          padding: "7px 9px",
          border: "1px solid #395044",
          borderRadius: 8,
          background: "rgba(11,17,16,.88)",
          backdropFilter: "blur(8px)",
          color: "#d7e1dc",
          font: "10px DM Mono, monospace",
        }}
      >
        <span><i style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#5db7ff", marginRight: 5 }} />Ти</span>
        <span><i style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#c8f65b", marginRight: 5 }} />Бензиностанции</span>
        <span><i style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", border: "1px solid #c8f65b", marginRight: 5 }} />Радиус {radiusKm} km</span>
      </div>
    </div>
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
