"use client";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LocationMap } from "./location-map";
import { DieselForecast } from "./diesel-forecast";
import { ThemeToggle } from "./theme-toggle";

type FuelKey = "diesel" | "a95" | "a100" | "lpg" | "cng";
type Overview = { average: number | null; lowest: number | null; highest: number | null; median: number | null; stationCount: number; sourceCount: number; confidence: number | null; latest: string | null };
type Point = { date: string; average: number; minimum: number; maximum: number };
type Station = { id: string; name: string; brand: string | null; city: string; address: string; price: number; observedAt: string; confidence: number; sourceUrl: string; latitude: number | null; longitude: number | null };
type NearbyStation = Station & { distanceKm: number };
type Change = { id: string; station: string; city: string; oldPrice: number; newPrice: number; change: number; percent: number; detectedAt: string; sourceUrl: string };
type NewsItem = { id: string; title: string; url: string; publisher: string; publishedAt: string; summary: string | null; impact: "GOOD" | "BAD" | "NEUTRAL" | null };

const FUEL_OPTIONS: Array<{ key: FuelKey; label: string }> = [
  { key: "diesel", label: "Diesel" },
  { key: "a95", label: "A95" },
  { key: "a100", label: "A100" },
  { key: "lpg", label: "LPG" },
  { key: "cng", label: "CNG" },
];
const fuelLabel = (key: FuelKey) => FUEL_OPTIONS.find((x) => x.key === key)?.label ?? "Diesel";
const fmt = new Intl.NumberFormat("bg-BG", { style: "currency", currency: "EUR", minimumFractionDigits: 3 });
const age = (value: string | null) => {
  if (!value) return "Няма данни";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Няма данни";
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  return minutes < 60 ? `преди ${minutes} мин` : minutes < 1440 ? `преди ${Math.round(minutes / 60)} ч` : `преди ${Math.round(minutes / 1440)} дни`;
};

export function Dashboard() {
  const [fuel, setFuel] = useState<FuelKey>("diesel");
  const [period, setPeriod] = useState(30);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [history, setHistory] = useState<Point[]>([]);
  const [nearby, setNearby] = useState<NearbyStation[]>([]);
  const [changes, setChanges] = useState<Change[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [radius, setRadius] = useState(5);
  const [locationLoading, setLocationLoading] = useState(false);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/fuels/${fuel}`).then((r) => r.json()),
      fetch(`/api/fuels/${fuel}/history?days=${period}`).then((r) => r.json()),
      fetch(`/api/prices/changes?fuel=${fuel}`).then((r) => r.json()),
      fetch(`/api/news`).then((r) => r.json()),
    ])
      .then(([overviewData, historyData, changesData, newsData]) => {
        setOverview(overviewData);
        setHistory(Array.isArray(historyData) ? historyData : []);
        setChanges(Array.isArray(changesData) ? changesData : []);
        setNews(Array.isArray(newsData) ? newsData : []);
      })
      .catch((error) => console.error("Dashboard loading error:", error))
      .finally(() => setLoading(false));
  }, [fuel, period]);

  useEffect(() => {
    if (!coords) return;
    const controller = new AbortController();
    setNearbyLoading(true);
    setNearby([]);
    fetch(`/api/prices/nearby?lat=${encodeURIComponent(coords.lat)}&lon=${encodeURIComponent(coords.lon)}&radius=${radius}&limit=10&fuel=${fuel}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error("Неуспешно зареждане на близките станции");
        return r.json();
      })
      .then((data) => setNearby(Array.isArray(data) ? data : []))
      .catch((error) => {
        if (error.name !== "AbortError") setLocationError("Неуспяхме да заредим близките станции.");
      })
      .finally(() => setNearbyLoading(false));
    return () => controller.abort();
  }, [coords, radius, fuel]);

  const movement = useMemo(() => {
    if (history.length < 2) return null;
    const first = history[0].average;
    const last = history.at(-1)!.average;
    if (!Number.isFinite(first) || first === 0 || !Number.isFinite(last)) return null;
    return { value: last - first, percent: ((last - first) / first) * 100 };
  }, [history]);
  const hasData = overview?.average != null;
  const label = fuelLabel(fuel);
  const getLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("Браузърът не поддържа геолокация.");
      return;
    }
    setLocationLoading(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lon: position.coords.longitude });
        setLocationLoading(false);
      },
      () => {
        setLocationError("Не успяхме да получим местоположението.");
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  };

  return <main className="shell">
    <header><a className="brand" href="/">Fuel<span>Tracker</span><i>BG</i></a><nav><a className="active" href="#overview">Обзор</a><a href="#cheapest">Най-евтин</a><a href="#changes">Промени</a><a href="/admin">Админ</a></nav><div className="header-actions"><ThemeToggle /><button className="live"><b /> Данни на живо</button></div></header>
    <section className="fuel-selector-section"><div><p className="eyebrow">ИЗБЕРИ ГОРИВО</p><div className="fuel-selector">{FUEL_OPTIONS.map((option) => <button key={option.key} type="button" className={fuel === option.key ? "selected" : ""} onClick={() => setFuel(option.key)}>{option.label}</button>)}</div></div></section>
    <section className="hero" id="overview"><div><p className="eyebrow">БЪЛГАРИЯ · {label.toUpperCase()}</p><h1>Цената на <em>{label.toLowerCase()},</em><br />без догадки.</h1><p className="lede">Показваме само проследими цени с посочен източник и време на наблюдение.</p></div><div className="hero-chip"><span>Надеждност</span><strong>{overview?.confidence ?? "—"}{overview?.confidence != null && "%"}</strong><small>{overview?.stationCount ?? 0} валидни обекта</small></div></section>
    <section className="primary-card"><div className="price-head"><div><p>СРЕДНА ЦЕНА · {label.toUpperCase()}</p><h2>{hasData ? fmt.format(overview!.average!) : "Няма данни"}<small>{hasData && " / литър"}</small></h2><div className={movement && movement.value >= 0 ? "movement up" : "movement down"}>{movement ? `${movement.value >= 0 ? "▲" : "▼"} ${fmt.format(Math.abs(movement.value))} · ${Math.abs(movement.percent).toFixed(1)}% за избрания период` : "Няма достатъчно история за тренд"}</div></div><div className="fresh"><span className={overview?.latest ? "dot fresh" : "dot"} />Последно обновяване: <b>{age(overview?.latest ?? null)}</b><small>{overview?.sourceCount ?? 0} потвърдени източника</small></div></div>
      <div className="periods">{[[1,"24ч"],[7,"7 дни"],[30,"30 дни"],[90,"3 мес"],[365,"1 год"]].map(([value,labelText]) => <button key={String(value)} onClick={() => setPeriod(Number(value))} className={period === value ? "selected" : ""}>{labelText}</button>)}</div>
      <div className="chart-wrap">{history.length ? <ResponsiveContainer width="100%" height={290}><AreaChart data={history}><defs><linearGradient id="fuel" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#bfef4b" stopOpacity=".36"/><stop offset="100%" stopColor="#bfef4b" stopOpacity="0"/></linearGradient></defs><CartesianGrid vertical={false} stroke="#23302f"/><XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: "#778481", fontSize: 11 }}/><YAxis domain={["dataMin - 0.01", "dataMax + 0.01"]} tickFormatter={(v) => `€${v.toFixed(2)}`} tickLine={false} axisLine={false} tick={{ fill: "#778481", fontSize: 11 }}/><Tooltip contentStyle={{ background: "#15201f", border: "1px solid #30413e", borderRadius: 10 }} formatter={(v) => fmt.format(Number(v))}/><Area type="monotone" dataKey="average" stroke="#c6f44d" strokeWidth={3} fill="url(#fuel)" /></AreaChart></ResponsiveContainer> : <Empty label={loading ? "Зареждаме потвърдените наблюдения…" : "Все още няма валидирани ценови наблюдения за този период."}/>}</div>
    </section>
    <section className="stats">{[["Средна", overview?.average],["Най-ниска", overview?.lowest],["Най-висока", overview?.highest],["Медианна", overview?.median]].map(([labelText, value]) => <article key={String(labelText)}><span>{labelText}</span><strong>{typeof value === "number" ? fmt.format(value) : "—"}</strong><small>без аномални стойности</small></article>)}</section>
    <section className="grid"><article className="panel" id="cheapest"><div className="panel-title"><h3>НАЙ-ЕВТИН ДО ТЕБ · {label.toUpperCase()}</h3><button type="button" onClick={getLocation} disabled={locationLoading}>{locationLoading ? "Търсим…" : "Моето местоположение"}</button></div><div className="station-list">{nearby.length ? nearby.slice(0,5).map((station, index) => <a key={station.id} className="station" href={station.sourceUrl} target="_blank"><b>{String(index + 1).padStart(2,"0")}</b><div><strong>{station.brand ?? station.name}</strong><span>{station.city} · {station.address}</span></div><div className="station-price"><strong>{fmt.format(station.price)}</strong><span>{station.distanceKm.toFixed(1)} км · {age(station.observedAt)}</span></div></a>) : <Empty label={locationError ?? (coords ? `Няма станции с валидна цена в радиус ${radius} km.` : "Използвай местоположението си, за да видиш най-евтиния вариант наблизо.")}/>}</div><LocationMap latitude={coords?.lat ?? null} longitude={coords?.lon ?? null} radiusKm={radius} stations={nearby} onRadiusChange={setRadius} /></article>
      <article className="panel" id="changes"><div className="panel-title"><h3>ПОСЛЕДНИ ПРОМЕНИ · {label.toUpperCase()}</h3><a href="#">Цял журнал →</a></div><div className="change-list">{changes.length ? changes.slice(0,5).map((change) => <a key={change.id} className="change" href={change.sourceUrl} target="_blank"><div className={change.change >= 0 ? "arrow rise" : "arrow fall"}>{change.change >= 0 ? "↑" : "↓"}</div><div><strong>{change.station} <span>· {change.city}</span></strong><small>{fmt.format(change.oldPrice)} → {fmt.format(change.newPrice)} · {age(change.detectedAt)}</small></div><b className={change.change >= 0 ? "rise" : "fall"}>{change.change >= 0 ? "+" : ""}{fmt.format(change.change)}</b></a>) : <Empty label="Ще се появят при първата открита промяна."/>}</div></article></section>
    <DieselForecast fuel={fuel} />
    <section className="insight"><div className="signal">⌁</div><div><p className="eyebrow">ПАЗАРЕН КОНТЕКСТ</p><h3>Какво движи {label.toLowerCase()}?</h3><p>Тази секция показва проверени факти от свързани пазарни източници. Причинно-следствени изводи не се правят, докато данните не са достатъчни.</p></div><span className="pending">Очаква пазарни данни</span></section>
    <footer>FUEL TRACKER BULGARIA <span>·</span> Цените се публикуват с източник, час и индикатор за свежест.</footer>
  </main>;
}
function Empty({ label }: { label: string }) { return <div className="empty"><span>◌</span>{label}</div>; }
