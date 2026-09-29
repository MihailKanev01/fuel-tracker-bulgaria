"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useFuelPreferences } from "@/hooks/use-fuel-preferences";
import type { StationDetail } from "@/lib/station";
import { age } from "@/lib/dashboard-utils";

const fmt = new Intl.NumberFormat("bg-BG", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 3,
});

type Range = 1 | 7 | 30 | 90 | 365;

function navigationUrl(station: StationDetail) {
  const destination =
    station.latitude != null && station.longitude != null
      ? `${station.latitude},${station.longitude}`
      : `${station.name}, ${station.address}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

export function StationPage({ station }: { station: StationDetail }) {
  const { favorites, toggleFavorite } = useFuelPreferences();
  const [range, setRange] = useState<Range>(30);

  const isFavorite = favorites.some((favorite) => favorite.id === station.id);
  const history = useMemo(() => {
    const from = Date.now() - range * 86_400_000;
    return station.history.filter((item) => new Date(item.date + "T23:59:59").getTime() >= from);
  }, [range, station.history]);

  const stats = useMemo(() => {
    if (!history.length) return null;
    const values = history.flatMap((item) => [item.average]);
    const lowest = Math.min(...values);
    const highest = Math.max(...values);
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;

    const first = history[0]?.average ?? null;
    const last = history.at(-1)?.average ?? null;
    const change = first != null && last != null && first !== 0 ? last - first : null;
    const percent = change != null && first != null ? (change / first) * 100 : null;

    return { average, lowest, highest, change, percent };
  }, [history]);

  const toggle = () => {
    const existingFavorite = favorites.find((favorite) => favorite.id === station.id);
    if (existingFavorite) {
      toggleFavorite(existingFavorite);
      return;
    }

    toggleFavorite({
      id: station.id,
      name: station.name,
      brand: station.brand,
      city: station.city,
      address: station.address,
      price: station.price ?? 0,
      observedAt: station.observedAt ?? new Date().toISOString(),
      confidence: station.confidence ?? 0,
      sourceUrl: station.sourceUrl ?? `https://bg.fuelo.net/gasstation/id/${encodeURIComponent(station.id)}?lang=bg`,
      latitude: station.latitude,
      longitude: station.longitude,
    });
  };

  return (
    <main className="station-page">
      <header className="station-page-header">
        <a className="brand" href="/">Fuel<span>Tracker</span><i>BG</i></a>
        <a className="back-link" href="/#cheapest">← Близки станции</a>
      </header>

      <section className="station-hero">
        <div className="station-hero-main">
          <p className="eyebrow">СТАНЦИЯ · {station.fuelLabel.toUpperCase()}</p>
          <div className="station-title-row">
            <div>
              <h1>{station.brand ?? station.name}</h1>
              {station.brand && station.name !== station.brand ? <p>{station.name}</p> : null}
            </div>
            <button
              type="button"
              className={isFavorite ? "station-favorite saved" : "station-favorite"}
              onClick={toggle}
              aria-label={isFavorite ? "Премахни станцията от любими" : "Добави станцията в любими"}
              title={isFavorite ? "Премахни от любими" : "Добави от любими"}
            >
              {isFavorite ? "★" : "☆"}
            </button>
          </div>
          <p className="station-address">{station.city} · {station.address}</p>
        </div>

        <div className="station-current">
          <span>ТЕКУЩА ЦЕНА</span>
          <strong>{station.price != null ? fmt.format(station.price) : "Няма данни"}</strong>
          <small>{station.observedAt ? `наблюдавана ${age(station.observedAt)}` : "Няма потвърдено наблюдение"}</small>
        </div>
      </section>

      <section className="station-actions">
        <a href={navigationUrl(station)} target="_blank" rel="noreferrer">Навигирай с Google Maps →</a>
        {station.sourceUrl ? <a href={station.sourceUrl} target="_blank" rel="noreferrer">Източник на цената →</a> : null}
      </section>

      {station.latitude != null && station.longitude != null ? (
        <section className="station-map-wrap panel">
          <div className="panel-title">
            <div>
              <h3>МЕСТОПОЛОЖЕНИЕ</h3>
              <small className="nearby-meta">{station.latitude.toFixed(6)}, {station.longitude.toFixed(6)}</small>
            </div>
          </div>
          <div className="station-map">
            <iframe
              title={`Карта на ${station.brand ?? station.name}`}
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${station.longitude - 0.006}%2C${station.latitude - 0.004}%2C${station.longitude + 0.006}%2C${station.latitude + 0.004}&layer=mapnik&marker=${station.latitude}%2C${station.longitude}`}
              loading="lazy"
            />
          </div>
        </section>
      ) : null}

      {station.liveOnly ? (
        <div className="station-notice">
          <strong>Live станция от Fuelo</strong>
          <span>Тази станция още няма достатъчно натрупана история в нашата база. Ще показваме история, когато започнат да постъпват собствени наблюдения.</span>
        </div>
      ) : null}

      <section className="station-history panel">
        <div className="panel-title">
          <div>
            <h3>ИСТОРИЯ НА ЦЕНАТА · {station.fuelLabel.toUpperCase()}</h3>
            <small className="nearby-meta">{station.history.length ? `${station.history.length} дни с наблюдения · до 365 дни` : "Все още няма натрупана история"}</small>
          </div>
        </div>

        <div className="periods station-periods">
          {([
            [1, "24ч"],
            [7, "7 дни"],
            [30, "30 дни"],
            [90, "3 мес"],
            [365, "1 год"],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" className={range === value ? "selected" : ""} onClick={() => setRange(value)}>
              {label}
            </button>
          ))}
        </div>

        {history.length ? (
          <div className="station-chart">
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="stationFuel" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#bfef4b" stopOpacity=".36" />
                    <stop offset="100%" stopColor="#bfef4b" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#23302f" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: "#778481", fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `€${v.toFixed(3)}`} tickLine={false} axisLine={false} tick={{ fill: "#778481", fontSize: 11 }} domain={["dataMin - 0.01", "dataMax + 0.01"]} />
                <Tooltip
                  contentStyle={{ background: "#15201f", border: "1px solid #30413e", borderRadius: 10 }}
                  formatter={(value) => [fmt.format(Number(value)), "Средна"]}
                />
                <Area type="monotone" dataKey="average" stroke="#c6f44d" strokeWidth={3} fill="url(#stationFuel)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="empty station-empty">
            <span>◌</span>
            Историята ще се появи след натрупване на повече ценови наблюдения.
          </div>
        )}
      </section>

      <section className="station-stats">
        {[
          ["Средна", stats?.average],
          ["Най-ниска", stats?.lowest],
          ["Най-висока", stats?.highest],
        ].map(([label, value]) => (
          <article key={String(label)}>
            <span>{label}</span>
            <strong>{typeof value === "number" ? fmt.format(value) : "—"}</strong>
            <small>за избрания период</small>
          </article>
        ))}
        <article>
          <span>ПРОМЯНА</span>
          <strong className={stats?.change != null && stats.change >= 0 ? "station-change-up" : "station-change-down"}>
            {stats?.change != null ? `${stats.change >= 0 ? "+" : ""}${fmt.format(stats.change)}` : "—"}
          </strong>
          <small>{stats?.percent != null ? `${stats.percent >= 0 ? "+" : ""}${stats.percent.toFixed(1)}%` : "няма достатъчно данни"}</small>
        </article>
      </section>

      <section className="station-source">
        <div>
          <p className="eyebrow">ПРОСЛЕДИМОСТ</p>
          <h3>Тази цена има източник и време на наблюдение.</h3>
          <p>{station.observedAt ? `Последно наблюдение: ${new Date(station.observedAt).toLocaleString("bg-BG")}` : "Няма потвърдено време на наблюдение."}</p>
        </div>
        <span>confidence {station.confidence ?? 0}%</span>
      </section>

      <footer>FUEL TRACKER BULGARIA <span>·</span> Данните са наблюдения, а не гарантирана цена в момента на посещение.</footer>
    </main>
  );
}
