"use client";

import { useEffect, useMemo, useState } from "react";
import type { NearbyStation } from "@/hooks/use-dashboard-data";
import type { FuelKey } from "@/lib/fuel";
import type { FavoriteStation } from "@/hooks/use-fuel-preferences";
import { age } from "@/lib/dashboard-utils";
import { LocationMap } from "./location-map";
import { useRouteMatrix } from "@/hooks/use-route-matrix";

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

function navigationUrl(station: FavoriteStation | NearbyStation) {
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
  fuel,
  fuelLabel,
  radius,
  setRadius,
  stations,
  coords,
  locationLoading,
  nearbyLoading,
  locationError,
  refreshLocation,
  quantity,
  setQuantity,
  consumption,
  setConsumption,
  favorites,
  onToggleFavorite,
  onUpdateFavorite,
}: {
  fuel: FuelKey;
  fuelLabel: string;
  radius: number;
  setRadius: (value: number) => void;
  stations: NearbyStation[];
  coords: { lat: number; lon: number } | null;
  locationLoading: boolean;
  nearbyLoading: boolean;
  locationError: string | null;
  refreshLocation: () => void;
  quantity: number;
  setQuantity: (value: number) => void;
  consumption: number;
  setConsumption: (value: number) => void;
  favorites: FavoriteStation[];
  onToggleFavorite: (station: FavoriteStation) => void;
  onUpdateFavorite: (station: FavoriteStation) => void;
}) {
  const [sortMode, setSortMode] = useState<SortMode>("price");
  const [brandFilter, setBrandFilter] = useState("ALL");
  const [showAll, setShowAll] = useState(false);

  const { routes, loading: routeLoading, error: routeError, candidateCount: routeCandidateCount } = useRouteMatrix(coords, stations);

  useEffect(() => {
    for (const station of stations) {
      if (!favorites.some((favorite) => favorite.id === station.id)) continue;
      onUpdateFavorite(station);
    }
  }, [stations, favorites, onUpdateFavorite]);

  const brands = useMemo(() => {
    return [...new Set(
      stations
        .map((station) => station.brand?.trim())
        .filter((brand): brand is string => Boolean(brand)),
    )].sort((a, b) => a.localeCompare(b, "bg"));
  }, [stations]);

  const favoriteIds = useMemo(
    () => new Set(favorites.map((favorite) => favorite.id)),
    [favorites],
  );

  const favoriteStations = useMemo(
    () => favorites.map((favorite) => stations.find((station) => station.id === favorite.id) ?? favorite),
    [favorites, stations],
  );

  const cheapestPrice = stations.length
    ? Math.min(...stations.map((station) => station.price))
    : null;

  const enriched = useMemo(() => {
    return stations.map((station) => {
      const route = routes[station.id];
      const routeDistanceKm = route?.distanceKm ?? station.distanceKm;
      const refillCost = station.price * quantity;
      const arrivalCost = routeDistanceKm * (consumption / 100) * station.price;
      return {
        station,
        routeDistanceKm,
        routeDurationMin: route?.durationMin ?? null,
        hasRealRoute: Boolean(route),
        refillCost,
        arrivalCost,
        totalCost: refillCost + arrivalCost,
      };
    });
  }, [stations, routes, quantity, consumption]);

  const filtered = useMemo(() => {
    const next = brandFilter === "ALL"
      ? enriched
      : enriched.filter(({ station }) => station.brand === brandFilter);

    return [...next].sort((a, b) => {
      if (sortMode === "distance") {
        return a.routeDistanceKm - b.routeDistanceKm || a.station.price - b.station.price;
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

  const nearest = enriched.length
    ? [...enriched].sort((a, b) => a.routeDistanceKm - b.routeDistanceKm || a.station.price - b.station.price)[0]
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

      {favorites.length > 0 ? (
        <div className="favorites-strip">
          <div className="favorites-strip-head">
            <div>
              <span className="favorites-kicker">ЗАПАЗЕНИ</span>
              <strong>Моите станции</strong>
            </div>
            <small>{favorites.length}/30</small>
          </div>
          <div className="favorites-list">
            {favoriteStations.map((station) => {
              const live = stations.find((item) => item.id === station.id);
              return (
                <div key={station.id} className="favorite-card">
                  <div className="favorite-card-main">
                    <span className="favorite-star">★</span>
                    <div>
                      <strong>
                        <a className="station-detail-link" href={`/station/${encodeURIComponent(station.id)}?fuel=${fuel}`}>
                          {station.brand ?? station.name}
                        </a>
                      </strong>
                      <small>{station.city} · {live ? age(live.observedAt) : `запазено · ${age(station.observedAt)}`}</small>
                    </div>
                  </div>
                  <div className="favorite-card-price">
                    <strong>{fmt.format(live?.price ?? station.price)}</strong>
                    <button type="button" onClick={() => onToggleFavorite(station)} aria-label={`Премахни ${station.brand ?? station.name} от любими`} title="Премахни от любими">×</button>
                  </div>
                  <a href={navigationUrl(station)} target="_blank" rel="noreferrer" className="favorite-nav">→</a>
                </div>
              );
            })}
          </div>
          <p className="favorites-note">Любимите се пазят само на това устройство в браузъра ти. Отвори името за пълната история.</p>
        </div>
      ) : null}

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

      {routeLoading ? (
        <div className="route-status nearby-route-loading">◌ Изчисляваме реалния пътен маршрут за {routeCandidateCount} близки станции…</div>
      ) : null}
      {routeError ? (
        <div className="route-status nearby-route-error">◌ {routeError} Показваме географско разстояние като резервен вариант.</div>
      ) : null}

      {enriched.length > 0 ? (
        <div className="nearby-summary">
          <div>
            <span>НАЙ-ЕВТИНА</span>
            <strong>{fmt.format(cheapestPrice ?? 0)}</strong>
          </div>
          <div>
            <span>НАЙ-БЛИЗКА</span>
            <strong>{nearest ? nearest.routeDistanceKm.toFixed(1) + " km" : "—"}</strong>
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
        {visible.map(({ station, arrivalCost, routeDistanceKm, routeDurationMin, hasRealRoute }, index) => {
          const isBestValue = bestValue?.station.id === station.id;
          const isCheapest = cheapestPrice != null && station.price === cheapestPrice;
          const isNearest = nearest?.id === station.id;

          return (
            <div key={station.id} className="station nearby-station">
              <b>{String(index + 1).padStart(2, "0")}</b>

              <div className="nearby-station-main">
                <div className="nearby-station-title">
                  <strong>
                    <a className="station-detail-link" href={`/station/${encodeURIComponent(station.id)}?fuel=${fuel}`}>
                      {station.brand ?? station.name}
                    </a>
                  </strong>
                  {isBestValue ? <span className="nearby-badge">НАЙ-ИЗГОДНА</span> : null}
                  {isCheapest ? <span className="nearby-badge muted">НАЙ-ЕВТИНА</span> : null}
                  {isNearest ? <span className="nearby-badge muted">НАЙ-БЛИЗКА</span> : null}
                  <button
                    type="button"
                    className={favoriteIds.has(station.id) ? "favorite-button saved" : "favorite-button"}
                    onClick={() => onToggleFavorite(station)}
                    aria-label={favoriteIds.has(station.id) ? `Премахни ${station.brand ?? station.name} от любими` : `Добави ${station.brand ?? station.name} в любими`}
                    title={favoriteIds.has(station.id) ? "Премахни от любими" : "Добави в любими"}
                  >
                    {favoriteIds.has(station.id) ? "★" : "☆"}
                  </button>
                </div>
                <span>{station.city} · {station.address}</span>
                <small>
                  {formatSaving(Math.max(0, station.price - (cheapestPrice ?? station.price)))} · {age(station.observedAt)} · confidence {station.confidence}%
                </small>
              </div>

              <div className="station-price nearby-price">
                <strong>{fmt.format(station.price)}</strong>
                <span>{routeDistanceKm.toFixed(1)} km{hasRealRoute ? " по пътя" : ""}</span>
                <small>{hasRealRoute && routeDurationMin != null ? Math.round(routeDurationMin) + " мин · " : ""}до станцията ≈ {money2.format(arrivalCost)}</small>
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
        Любимите, количеството и разходът се запазват автоматично за следващото отваряне на сайта.
      </p>

      <p className="nearby-disclaimer">
        Цената за достигане използва реален пътен маршрут, когато маршрутизаторът е наличен. Ако няма маршрут, временно се използва географското разстояние.
      </p>
    </article>
  );
}
