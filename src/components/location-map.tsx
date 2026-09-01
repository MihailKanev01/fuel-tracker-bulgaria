"use client";

import { useEffect, useRef, useState } from "react";

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
  interface Window { L?: any; }
}

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

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

export function LocationMap({ latitude, longitude, radiusKm, stations }: {
  latitude: number | null;
  longitude: number | null;
  radiusKm: number;
  stations: Station[];
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const [precisePosition, setPrecisePosition] = useState<{ lat: number; lon: number; accuracy: number } | null>(null);

  useEffect(() => {
    if (!("geolocation" in navigator)) return;

    let mounted = true;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (!mounted) return;
        setPrecisePosition({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      () => {},
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20000,
      },
    );

    return () => {
      mounted = false;
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  const userLat = precisePosition?.lat ?? latitude;
  const userLon = precisePosition?.lon ?? longitude;

  useEffect(() => {
    if (userLat == null || userLon == null || !mapRef.current) return;

    let cancelled = false;

    loadLeaflet().then((L) => {
      if (cancelled || !mapRef.current) return;

      if (!instanceRef.current) {
        const map = L.map(mapRef.current, {
          zoomControl: true,
          attributionControl: true,
          scrollWheelZoom: true,
        });

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

      const zoom = radiusKm <= 5 ? 15 : radiusKm <= 10 ? 14 : radiusKm <= 25 ? 12 : 11;
      map.setView([userLat, userLon], zoom, { animate: false });

      const bounds = L.latLngBounds([[userLat, userLon]]);

      const currentMarker = L.circleMarker([userLat, userLon], {
        radius: 8,
        color: "#0b1110",
        weight: 3,
        fillColor: "#4da3ff",
        fillOpacity: 1,
      }).addTo(layer);
      currentMarker.bindTooltip(
        precisePosition?.accuracy
          ? `Твоето местоположение · точност ±${Math.round(precisePosition.accuracy)} m`
          : "Твоето местоположение",
        { direction: "top" },
      );

      if (precisePosition?.accuracy && Number.isFinite(precisePosition.accuracy)) {
        L.circle([userLat, userLon], {
          radius: precisePosition.accuracy,
          color: "#4da3ff",
          weight: 1,
          fillColor: "#4da3ff",
          fillOpacity: 0.10,
        }).addTo(layer);
      }

      L.circle([userLat, userLon], {
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

      if (stations.length > 0) {
        map.fitBounds(bounds.pad(0.18), {
          maxZoom: radiusKm <= 5 ? 16 : 14,
          animate: false,
        });
      }

      setTimeout(() => map.invalidateSize(), 50);
    }).catch((error) => {
      if (!cancelled) console.error("Location map error:", error);
    });

    return () => {
      cancelled = true;
    };
  }, [userLat, userLon, radiusKm, stations, precisePosition?.accuracy]);

  useEffect(() => {
    return () => {
      instanceRef.current?.remove();
      instanceRef.current = null;
      layerRef.current = null;
    };
  }, []);

  if (userLat == null || userLon == null) {
    return (
      <div style={{
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
      }}>
        <div>
          <div style={{ fontSize: 26, color: "#5f7169", marginBottom: 8 }}>◌</div>
          <p style={{ margin: 0 }}>Картата ще се покаже след получаване на местоположението.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: "relative",
      height: 280,
      marginTop: 16,
      overflow: "hidden",
      border: "1px solid #273530",
      borderRadius: 10,
      background: "#111a18",
    }}>
      <div ref={mapRef} style={{ height: "100%", width: "100%" }} />
      <div style={{
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
      }}>
        <span><i style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#4da3ff", marginRight: 5 }} />Ти</span>
        <span><i style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#c8f65b", marginRight: 5 }} />Бензиностанции</span>
        <span><i style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", border: "1px solid #c8f65b", marginRight: 5 }} />Радиус {radiusKm} km</span>
        {precisePosition?.accuracy ? <span>± {Math.round(precisePosition.accuracy)} m</span> : null}
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
