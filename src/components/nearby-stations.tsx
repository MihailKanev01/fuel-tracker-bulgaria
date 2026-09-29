"use client";

import { useMemo, useState } from "react";
import type { NearbyStation } from "@/hooks/use-dashboard-data";
import { age } from "@/lib/dashboard-utils";
import { LocationMap } from "./location-map";

type SortMode = "price" | "distance" | "value";

const fmt = new Intl.NumberFormat("bg-BG", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 3,
});

const money2 = new Intl.NumberFormat("bg-BG", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

function navigationUrl(station: NearbyStation) {
  const destination = station.latitude != null && station.longitude != null
    ? `${station.latitude},${station.longitude}`
    : `${station.name}, ${station.address}`;

  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

function formatSaving(value: number) {
  if (value < 0.0005) return "същата цена";
  return `+${fmt.format(value)}/л спрямо най-евтината`;
}

export function NearbyStations({
  fuelLabel,
  radius,
  setRadius,
  stations,
  coords,
  locationLoading,
  nearbyLoading,
  locationError,
  refreshLocation,
}: {
  fuelLabel: string;
  radius: number;
  setRadius: (value: number) => void;
  stations: NearbyStation[];
  coords: { lat: number; lon: number } | null;
  locationLoading: boolean;
  nearbyLoading: boolean;
  locationError: string | null;
  refreshLocation: () => void;
}) {
  const [sortMode, setSortMode] = useState<SortMode>("price");
  const [brandFilter, setBrandFilter] = useState("ALL");
  const [quantity, setQuantity] = useState(50);
  const [consumption, setConsumption] = useState(7);
  const [showAll, setShowAll] = useState(false);

  const brands = useMemo(() => {
    return [...new Set(
      stations
        .map((station) => station.brand?.trim())
        .filter((brand): brand is string => Boolean(brand)),
    )].sort((a, b) => a.localeCompare(b, "bg"));
  }, [stations]);

  const cheapestPrice = stations.length
    ? Math.min(...stations.map((station) => station.price))
    : null;

  const enriched = useMemo(() => {
    return stations.map((station) => {
      const refillCost = station.price * quantity;
      const arrivalCost = station.distanceKm * (consumption / 100) * station.price;
      return {
        station,
        refillCost,
        arrivalCost,
        totalCost: refillCost + arrivalCost,
      };
    });
  }, [stations, quantity, consumption]);

  const filtered = useMemo(() => {
    const next = brandFilter === "ALL"
      ? enriched
      : enriched.filter(({ station }) => station.brand === brandFilter);

    return [...next].sort((a, b) => {
      if (sortMode === "distance") {
        return a.station.distanceKm - b.station.distanceKm || a.station.price - b.station.price;
      }

      if (sortMode === "value") {
        return a.totalCost - b.totalCost || a.station.price - b.station.price;
      }

      return a.station.price - b.station.price || a.station.distanceKm - b.station.distanceKm;
    });
  }, [brandFilter, enriched, sortMode]);

  const visible = showAll ? filtered : filtered.slice(0, 8);

  const bestValue = enriched.length
    ? [...enriched].sort((a, b) => a.totalCost - b.totalCost || a.station.price - b.station.price)[0]
    : null;

  const nearest = stations.length
    ? [...stations].sort((a, b) => a.distanceKm - b.distanceKm || a.price - b.price)[0]
    : null;

  return (
    <article className="panel nearby-panel" id="cheapest">
      <div className="panel-title nearby-heading">
        <div>
          <h3>НАЙ-ИЗГОДНО ДО ТЕБ · {fuelLabel.toUpperCase()}</h3>
          <small className="nearby-meta">
            {coords
              ? `${stations.length} станции · ${radius} km радиус`
              : "Получаваме местоположението ти автоматично"}
          </small>
        </div>
        <button type="button" onClick={refreshLocation} disabled={locationLoading}>
          {locationLoading ? "Обновяваме…" : "Обнови"}
        </button>
      </div>

      <div className="nearby-controls">
        <div className="periods nearby-periods" role="group" aria-label="Радиус за близки станции">
          {[5, 10, 25, 50].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setRadius(value);
                setShowAll(false);
              }}
              className={radius === value ? "selected" : ""}
            >
              {value} km
            </button>
          ))}
        </div>

        <div className="nearby-sort" role="group" aria-label="Сортиране на станции">
          <button type="button" className={sortMode === "price" ? "selected" : ""} onClick={() => setSortMode("price")}>
            Най-евтина
          </button>
          <button type="button" className={sortMode === "distance" ? "selected" : ""} onClick={() => setSortMode("distance")}>
            Най-близка
          </button>
          <button type="button" className={sortMode === "value" ? "selected" : ""} onClick={() => setSortMode("value")}>
            Най-изгодна
          </button>
        </div>
      </div>

      <div className="nearby-settings">
        <label>
          <span>Количество</span>
          <div className="nearby-input">
            <input
              type="number"
              min={5}
              max={120}
              step={1}
              value={quantity}
              onChange={(event) => setQuantity(Math.min(120, Math.max(5, Number(event.target.value) || 5)))}
            />
            <b>L</b>
          </div>
        </label>

        <label>
          <span>Разход</span>
          <div className="nearby-input">
            <input
              type="number"
              min={3}
              max={30}
              step={0.1}
              value={consumption}
              onChange={(event) => setConsumption(Math.min(30, Math.max(3, Number(event.target.value) || 3)))}
            />
            <b>L/100</b>
          </div>
        </label>

        <div className="nearby-setting-note">
          <strong>Как смятаме „най-изгодна“?</strong>
          <span>Цена за {quantity} L + ориентировъчен разход за достигане до станцията.</span>
        </div>
      </div>

      {brands.length > 0 ? (
        <div className="nearby-brands" aria-label="Филтър по марка">
          <button type="button" className={brandFilter === "ALL" ? "selected" : ""} onClick={() => setBrandFilter("ALL")}>
            Всички
          </button>
          {brands.map((brand) => (
            <button key={brand} type="button" className={brandFilter === brand ? "selected" : ""} onClick={() => setBrandFilter(brand)}>
              {brand}
            </button>
          ))}
        </div>
      ) : null}

      {enriched.length > 0 ? (
        <div className="nearby-summary">
          <div>
            <span>НАЙ-ЕВТИНА</span>
            <strong>{fmt.format(cheapestPrice ?? 0)}</strong>
          </div>
          <div>
            <span>НАЙ-БЛИЗКА</span>
            <strong>{nearest ? `${nearest.distanceKm.toFixed(1)} km` : "—"}</strong>
          </div>
          <div>
            <span>НАЙ-ИЗГОДНА</span>
            <strong>{bestValue ? money2.format(bestValue.totalCost) : "—"}</strong>
            <small>{bestValue ? `${bestValue.station.brand ?? bestValue.station.name} · ${quantity} L` : ""}</small>
          </div>
        </div>
      ) : null}

      {locationError ? <div className="empty nearby-empty">◌ {locationError}</div> : null}
      {nearbyLoading ? <div className="empty nearby-empty">◌ Търсим станции в радиус {radius} km…</div> : null}
      {!coords && !locationLoading && !locationError ? (
        <div className="empty nearby-empty">◌ Получаваме местоположението ти автоматично…</div>
      ) : null}

      {!nearbyLoading && filtered.length === 0 && coords && !locationError ? (
        <div className="empty nearby-empty">◌ Няма станции, които отговарят на избраните филтри.</div>
      ) : null}

      <div className="station-list nearby-station-list">
        {visible.map(({ station, arrivalCost }, index) => {
          const isBestValue = bestValue?.station.id === station.id;
          const isCheapest = cheapestPrice != null && station.price === cheapestPrice;
          const isNearest = nearest?.id === station.id;

          return (
            <div key={station.id} className="station nearby-station">
              <b>{String(index + 1).padStart(2, "0")}</b>

              <div className="nearby-station-main">
                <div className="nearby-station-title">
                  <strong>{station.brand ?? station.name}</strong>
                  {isBestValue ? <span className="nearby-badge">НАЙ-ИЗГОДНА</span> : null}
                  {isCheapest ? <span className="nearby-badge muted">НАЙ-ЕВТИНА</span> : null}
                  {isNearest ? <span className="nearby-badge muted">НАЙ-БЛИЗКА</span> : null}
                </div>
                <span>{station.city} · {station.address}</span>
                <small>
                  {formatSaving(Math.max(0, station.price - (cheapestPrice ?? station.price)))} · {age(station.observedAt)} · confidence {station.confidence}%
                </small>
              </div>

              <div className="station-price nearby-price">
                <strong>{fmt.format(station.price)}</strong>
                <span>{station.distanceKm.toFixed(1)} km</span>
                <small>път до там ≈ {money2.format(arrivalCost)}</small>
              </div>

              <a className="nearby-nav" href={navigationUrl(station)} target="_blank" rel="noreferrer">
                Навигирай →
              </a>
            </div>
          );
        })}
      </div>

      {filtered.length > 8 ? (
        <button type="button" className="nearby-more" onClick={() => setShowAll((value) => !value)}>
          {showAll ? "Покажи по-малко" : `Покажи още ${filtered.length - 8} станции`}
        </button>
      ) : null}

      <LocationMap latitude={coords?.lat ?? null} longitude={coords?.lon ?? null} radiusKm={radius} stations={stations} />

      <p className="nearby-disclaimer">
        Цената за достигане е ориентировъчна: използва посочения разход и географското разстояние до станцията, а не реален пътен маршрут.
      </p>
    </article>
  );
}
