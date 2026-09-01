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

function navigationUrls(station: Station) {
  const destination = station.latitude != null && station.longitude != null
    ? `${station.latitude},${station.longitude}`
    : `${station.name}, ${station.address}`;

  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`,
    waze: station.latitude != null && station.longitude != null
      ? `https://www.waze.com/ul?ll=${station.latitude}%2C${station.longitude}&navigate=yes`
      : `https://www.waze.com/ul?q=${encodeURIComponent(destination)}&navigate=yes`,
    apple: `https://maps.apple.com/?daddr=${encodeURIComponent(destination)}&dirflg=d`,
  };
}

export function LocationMap({ latitude, longitude, radiusKm, stations }: {
  latitude: number | null;
  longitude: number | null;
  radiusKm: number;
  stations: Station[];
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const [precisePosition, setPrecisePosition] = useState<{ lat: number; lon: number; accuracy: number } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [navigationStation, setNavigationStation] = useState<Station | null>(null);

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

  useEffect(() => {
    const onFullscreenChange = () => {
      const active = document.fullscreenElement === containerRef.current;
      setFullscreen(active);
      setTimeout(() => instanceRef.current?.invalidateSize(), 100);
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    const onStationClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const link = target?.closest<HTMLAnchorElement>("a.station");
      if (!link) return;

      const nameElement = link.querySelector<HTMLElement>("strong");
      const stationName = nameElement?.textContent?.trim();
      if (!stationName) return;

      const station = stations.find((item) => item.name === stationName);
      if (!station) return;

      event.preventDefault();
      event.stopPropagation();
      setNavigationStation(station);
    };

    document.addEventListener("click", onStationClick, true);
    return () => document.removeEventListener("click", onStationClick, true);
  }, [stations]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavigationStation(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
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
          `<strong>${escapeHtml(station.name)}</strong><br/>${escapeHtml(station.city)}<br/><b>${station.price.toFixed(3)} €/л</b>${station.distanceKm != null ? `<br/>${station.distanceKm.toFixed(2)} km` : ""}<br/><span style="color:#9fce5e">Избери станцията от списъка за навигация</span>`,
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

  const toggleFullscreen = async () => {
    const element = containerRef.current;
    if (!element) return;

    try {
      if (document.fullscreenElement === element) {
        await document.exitFullscreen();
      } else {
        await element.requestFullscreen();
      }
    } catch (error) {
      console.error("Map fullscreen error:", error);
    }
  };

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

  const urls = navigationStation ? navigationUrls(navigationStation) : null;

  return (
    <>
      <div
        ref={containerRef}
        style={{
          position: "relative",
          height: fullscreen ? "100vh" : 280,
          width: "100%",
          marginTop: fullscreen ? 0 : 16,
          overflow: "hidden",
          border: fullscreen ? "0" : "1px solid #273530",
          borderRadius: fullscreen ? 0 : 10,
          background: "#111a18",
        }}
      >
        <div ref={mapRef} style={{ height: "100%", width: "100%" }} />

        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label={fullscreen ? "Затвори цял екран" : "Отвори картата на цял екран"}
          title={fullscreen ? "Затвори цял екран" : "Цял екран"}
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            zIndex: 1000,
            width: 40,
            height: 40,
            display: "grid",
            placeItems: "center",
            border: "1px solid #395044",
            borderRadius: 10,
            background: "rgba(11,17,16,.92)",
            color: "#d7e1dc",
            cursor: "pointer",
            fontSize: 20,
            lineHeight: 1,
            boxShadow: "0 8px 24px rgba(0,0,0,.28)",
            backdropFilter: "blur(8px)",
          }}
        >
          {fullscreen ? "✕" : "⛶"}
        </button>

        {fullscreen ? (
          <div style={{
            position: "absolute",
            top: 10,
            left: 10,
            zIndex: 1000,
            padding: "8px 11px",
            border: "1px solid #395044",
            borderRadius: 9,
            background: "rgba(11,17,16,.92)",
            color: "#d7e1dc",
            font: "11px DM Mono, monospace",
            backdropFilter: "blur(8px)",
          }}>
            Около теб · {radiusKm} km
          </div>
        ) : null}

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

      {navigationStation && urls ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Избери приложение за навигация"
          onClick={() => setNavigationStation(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 3000,
            display: "grid",
            placeItems: "center",
            padding: 20,
            background: "rgba(5,10,9,.74)",
            backdropFilter: "blur(10px)",
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(430px, 100%)",
              border: "1px solid #395044",
              borderRadius: 16,
              background: "linear-gradient(145deg,#16211e,#0f1715)",
              boxShadow: "0 30px 90px rgba(0,0,0,.55)",
              padding: 22,
              color: "#e8edeb",
              fontFamily: "Manrope, Arial, sans-serif",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 18 }}>
              <div>
                <div style={{ color: "#91aa9f", font: "500 10px DM Mono, monospace", letterSpacing: 1.2, marginBottom: 7 }}>НАВИГАЦИЯ</div>
                <h3 style={{ margin: 0, fontSize: 21, letterSpacing: -0.7 }}>{navigationStation.name}</h3>
                <p style={{ margin: "6px 0 0", color: "#899691", fontSize: 12, lineHeight: 1.5 }}>{navigationStation.address}</p>
              </div>
              <button
                type="button"
                onClick={() => setNavigationStation(null)}
                aria-label="Затвори"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  border: "1px solid #395044",
                  background: "#14201b",
                  color: "#aebbb5",
                  cursor: "pointer",
                  fontSize: 18,
                }}
              >×</button>
            </div>

            <p style={{ margin: "0 0 12px", color: "#72817a", font: "11px DM Mono, monospace" }}>Избери приложение за маршрут до станцията:</p>

            <div style={{ display: "grid", gap: 9 }}>
              <a href={urls.google} target="_blank" rel="noreferrer" style={navigationButtonStyle}>
                <span style={appIconStyle}>G</span>
                <span><b style={appTitleStyle}>Google Maps</b><small style={appMetaStyle}>Маршрут до точните координати</small></span>
                <span style={arrowStyle}>→</span>
              </a>
              <a href={urls.waze} target="_blank" rel="noreferrer" style={navigationButtonStyle}>
                <span style={{ ...appIconStyle, background: "#dceef2", color: "#1590ad" }}>W</span>
                <span><b style={appTitleStyle}>Waze</b><small style={appMetaStyle}>Навигация до координатите</small></span>
                <span style={arrowStyle}>→</span>
              </a>
              <a href={urls.apple} target="_blank" rel="noreferrer" style={navigationButtonStyle}>
                <span style={{ ...appIconStyle, background: "#e1e5e4", color: "#111a18" }}></span>
                <span><b style={appTitleStyle}>Apple Maps</b><small style={appMetaStyle}>Отваряне на маршрут</small></span>
                <span style={arrowStyle}>→</span>
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

const navigationButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 11,
  padding: "11px 12px",
  border: "1px solid #2e4039",
  borderRadius: 11,
  background: "#13201b",
  color: "inherit",
  textDecoration: "none",
  transition: "border-color .18s ease, background .18s ease, transform .18s ease",
};

const appIconStyle: React.CSSProperties = {
  width: 30,
  height: 30,
  display: "grid",
  placeItems: "center",
  flex: "0 0 auto",
  borderRadius: 8,
  background: "#dff08d",
  color: "#20301c",
  fontWeight: 800,
  fontSize: 13,
};

const appTitleStyle: React.CSSProperties = { display: "block", fontSize: 13 };
const appMetaStyle: React.CSSProperties = { display: "block", marginTop: 2, color: "#7e8c87", font: "10px DM Mono, monospace" };
const arrowStyle: React.CSSProperties = { marginLeft: "auto", color: "#c8f65b", fontSize: 17 };

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
