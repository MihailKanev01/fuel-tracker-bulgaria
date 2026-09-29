"use client";

import { useEffect, useMemo, useState } from "react";
import type { FuelKey } from "@/lib/fuel";

type Coord = { lat: number; lon: number };
type GeoResult = Coord & { label: string };
type Alternative = {
  station: { id: string; name: string; brand: string | null; city: string; address: string; price: number; observedAt: string; latitude: number; longitude: number; corridorKm: number };
  route: { distanceKm: number; durationMin: number; geometry: Array<[number, number]> };
  detourKm: number;
  detourMin: number;
  extraTravelCost: number;
  fillCost: number;
  totalFuelActionCost: number;
};
type TripResult = { fuel: FuelKey; quantity: number; consumption: number; baseRoute: { distanceKm: number; durationMin: number; geometry: Array<[number, number]> }; stationCount: number; alternatives: Alternative[] };

const money = new Intl.NumberFormat("bg-BG", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
const fuelLabels: Record<FuelKey, string> = { diesel: "Diesel", a95: "A95", a100: "A100", lpg: "LPG", cng: "CNG" };

declare global { interface Window { L?: any } }
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

function loadLeaflet() {
  return new Promise<any>((resolve, reject) => {
    if (window.L) return resolve(window.L);
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${LEAFLET_JS}"]`);
    if (!document.querySelector<HTMLLinkElement>(`link[href="${LEAFLET_CSS}"]`)) {
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

function distanceText(value: number) { return value.toFixed(1) + " km"; }

export function TripPlanner({
  coords, fuel, quantity, consumption, fuelLabel,
}: { coords: Coord | null; fuel: FuelKey; quantity: number; consumption: number; fuelLabel: string }) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [places, setPlaces] = useState<GeoResult[]>([]);
  const [destination, setDestination] = useState<GeoResult | null>(null);
  const [trip, setTrip] = useState<TripResult | null>(null);
  const [tripLoading, setTripLoading] = useState(false);
  const [tripError, setTripError] = useState<string | null>(null);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);

  const selected = useMemo(() => trip?.alternatives.find((item) => item.station.id === selectedStationId) ?? trip?.alternatives[0] ?? null, [trip, selectedStationId]);

  const searchDestination = async () => {
    const value = query.trim();
    if (value.length < 2) { setSearchError("Въведи град или адрес."); return; }
    setSearching(true); setSearchError(null); setPlaces([]);
    try {
      const response = await fetch("/api/geocode", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ query: value }) });
      const data = (await response.json().catch(() => null)) as { results?: GeoResult[]; error?: string } | null;
      if (!response.ok) throw new Error(data?.error || "Търсенето не успя.");
      setPlaces(Array.isArray(data?.results) ? data.results : []);
      if (!data?.results?.length) setSearchError("Няма намерени подходящи места.");
    } catch (error) { setSearchError(error instanceof Error ? error.message : "Търсенето не успя."); }
    finally { setSearching(false); }
  };

  const calculateTrip = async () => {
    if (!coords || !destination) { setTripError("Нужно е начално и крайно местоположение."); return; }
    setTripLoading(true); setTripError(null); setTrip(null); setSelectedStationId(null);
    try {
      const response = await fetch("/api/trip", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ origin: coords, destination: { lat: destination.lat, lon: destination.lon }, fuel, quantity, consumption }),
      });
      const data = (await response.json().catch(() => null)) as TripResult | { error?: string } | null;
      if (!response.ok) throw new Error(data && "error" in data && typeof data.error === "string" ? data.error : "Пътуването не успя.");
      setTrip(data as TripResult);
    } catch (error) { setTripError(error instanceof Error ? error.message : "Пътуването не успя."); }
    finally { setTripLoading(false); }
  };

  useEffect(() => {
    if (!trip || !coords || !selected) return;
    let cancelled = false;
    let map: any = null;
    loadLeaflet().then((L) => {
      if (cancelled) return;
      const element = document.getElementById("trip-planner-map");
      if (!element) return;
      map = L.map(element, { zoomControl: true, attributionControl: true, scrollWheelZoom: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);

      const basePoints = trip.baseRoute.geometry.map(([lon, lat]) => [lat, lon]);
      const baseLine = L.polyline(basePoints, { color: "#73857b", weight: 4, opacity: 0.7, dashArray: "8 8" }).addTo(map);
      const selectedPoints = selected.route.geometry.map(([lon, lat]) => [lat, lon]);
      const selectedLine = L.polyline(selectedPoints, { color: "#c8f65b", weight: 6, opacity: 0.95 }).addTo(map);
      L.circleMarker([coords.lat, coords.lon], { radius: 8, color: "#0b1110", weight: 3, fillColor: "#4da3ff", fillOpacity: 1 }).addTo(map).bindTooltip("Старт");
      L.circleMarker([destination.lat, destination.lon], { radius: 8, color: "#0b1110", weight: 3, fillColor: "#d8a24a", fillOpacity: 1 }).addTo(map).bindTooltip("Крайна точка");
      L.circleMarker([selected.station.latitude, selected.station.longitude], { radius: 8, color: "#0b1110", weight: 3, fillColor: "#c8f65b", fillOpacity: 1 }).addTo(map).bindTooltip("Избрана станция");
      map.fitBounds(L.featureGroup([baseLine, selectedLine]).getBounds().pad(0.15), { maxZoom: 12, animate: false });
      setTimeout(() => map.invalidateSize(), 80);
    }).catch(() => {});
    return () => { cancelled = true; map?.remove(); };
  }, [trip, selected, coords, destination]);

  return (
    <section className="trip-planner-section" id="trip">
      <div className="trip-planner-heading">
        <div>
          <p className="eyebrow">ПЪТУВАНЕ</p>
          <h2>Намери къде да спреш по маршрута.</h2>
          <p>Задай крайна точка и сравни станции, които са близо до реалния път, включително отклонението и разхода за достигането им.</p>
        </div>
        <div className="trip-planner-meta"><span>СТАРТ</span><strong>{coords ? "Текущото ти местоположение" : "Няма местоположение"}</strong><small>{fuelLabel} · {consumption.toFixed(1)} L/100 · {quantity} L</small></div>
      </div>

      <div className="trip-planner-controls panel">
        <div className="trip-search-row">
          <label className="trip-search-field">
            <span>Крайна точка</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void searchDestination(); }} placeholder="Напр. София, Пловдив, Бургас" maxLength={160} />
          </label>
          <button type="button" className="trip-search-button" onClick={() => void searchDestination()} disabled={searching}>{searching ? "Търсим…" : "Търси"}</button>
        </div>

        {searchError ? <div className="trip-message trip-error">◌ {searchError}</div> : null}
        {places.length ? <div className="trip-place-results">{places.map((place) => <button key={place.lat + ":" + place.lon + ":" + place.label} type="button" className={destination?.label === place.label ? "selected" : ""} onClick={() => { setDestination(place); setPlaces([]); setTrip(null); setTripError(null); }}>{place.label}</button>)}</div> : null}

        <div className="trip-destination-row">
          <div><span>ИЗБРАНА КРАЙНА ТОЧКА</span><strong>{destination?.label ?? "Не е избрана"}</strong></div>
          <button type="button" className="trip-calculate-button" disabled={!coords || !destination || tripLoading} onClick={() => void calculateTrip()}>{tripLoading ? "Изчисляваме…" : "Сравни маршрута"}</button>
        </div>

        <p className="trip-attribution">Търсенето на място е по заявка на потребителя и използва Nominatim/OpenStreetMap. Няма автоматично подсказване.</p>
      </div>

      {tripError ? <div className="trip-message trip-error">◌ {tripError}</div> : null}

      {trip ? (
        <div className="trip-results">
          <div className="trip-overview panel">
            <div><span>ДИРЕКТЕН МАРШРУТ</span><strong>{distanceText(trip.baseRoute.distanceKm)}</strong><small>{Math.round(trip.baseRoute.durationMin)} мин</small></div>
            <div><span>КАНДИДАТ-СТАНЦИИ</span><strong>{trip.stationCount}</strong><small>в близост до маршрута</small></div>
            <div><span>КОЛИЧЕСТВО</span><strong>{trip.quantity} L</strong><small>{fuelLabels[trip.fuel]}</small></div>
          </div>

          <div className="trip-content">
            <div className="trip-alternatives panel">
              <div className="panel-title"><div><h3>СТАНЦИИ ПО МАРШРУТА</h3><small className="nearby-meta">Сравнение спрямо директния маршрут</small></div></div>
              {trip.alternatives.length ? trip.alternatives.map((item) => {
                const active = selected?.station.id === item.station.id;
                return <button type="button" key={item.station.id} className={active ? "trip-station-card selected" : "trip-station-card"} onClick={() => setSelectedStationId(item.station.id)}>
                  <div className="trip-station-head"><strong>{item.station.brand ?? item.station.name}</strong><span>{item.station.price.toFixed(3)} €/L</span></div>
                  <small>{item.station.address}, {item.station.city}</small>
                  <div className="trip-station-metrics"><span>Маршрут <b>{distanceText(item.route.distanceKm)}</b></span><span>Отклонение <b>+{distanceText(item.detourKm)}</b></span><span>Доп. време <b>+{Math.round(item.detourMin)} мин</b></span><span>До станцията <b>{money.format(item.extraTravelCost)}</b></span></div>
                  <div className="trip-station-total"><span>Зареждане {trip.quantity} L + отклонение</span><strong>{money.format(item.totalFuelActionCost)}</strong></div>
                </button>;
              }) : <div className="empty">Няма станции с локално запазена цена достатъчно близо до този маршрут.</div>}
            </div>

            <div className="trip-map-panel panel">
              <div className="panel-title"><div><h3>КАРТА</h3><small className="nearby-meta">Сива линия: директно · зелена: през избраната станция</small></div></div>
              {selected ? <div id="trip-planner-map" className="trip-planner-map" /> : <div className="trip-map-empty">Избери станция, за да видиш маршрута.</div>}
              {selected ? <div className="trip-selected-summary"><span>{selected.station.brand ?? selected.station.name}</span><strong>{money.format(selected.totalFuelActionCost)}</strong><small>+{distanceText(selected.detourKm)} отклонение · +{Math.round(selected.detourMin)} мин</small></div> : null}
            </div>
          </div>

          <p className="nearby-disclaimer">Точката на станцията и цената идват от наличните наблюдения в системата. Сумата „зареждане + отклонение“ не включва разхода на гориво по основния маршрут, защото той съществува и без спиране.</p>
        </div>
      ) : null}
    </section>
  );
}
