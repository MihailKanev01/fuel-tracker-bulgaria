"use client";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LocationMap } from "./location-map";
import { DieselForecast } from "./diesel-forecast";

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
const fuelLabel = (key: FuelKey) => FUEL_OPTIONS.find((item) => item.key === key)?.label ?? "Diesel";
const fmt = new Intl.NumberFormat("bg-BG", { style: "currency", currency: "EUR", minimumFractionDigits: 3 });
const age = (value: string | null) => { if (!value) return "Няма данни"; const date = new Date(value); if (Number.isNaN(date.getTime())) return "Няма данни"; const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000)); return minutes < 60 ? `преди ${minutes} мин` : minutes < 1440 ? `преди ${Math.round(minutes / 60)} ч` : `преди ${Math.round(minutes / 1440)} дни`; };

export function Dashboard() {
  const [fuel, setFuel] = useState<FuelKey>("diesel");
  const [period, setPeriod] = useState(30);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [history, setHistory] = useState<Point[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
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
      fetch(`/api/prices/cheapest?fuel=${fuel}&limit=5`).then((r) => r.json()),
      fetch(`/api/prices/changes?fuel=${fuel}`).then((r) => r.json()),
      fetch("/api/news").then((r) => r.json()),
    ]).then(([a, b, c, d, e]) => {
      setOverview(a);
      setHistory(Array.isArray(b) ? b : []);
      setStations(Array.isArray(c) ? c : []);
      setChanges(Array.isArray(d) ? d : []);
      setNews(Array.isArray(e) ? e : []);
    }).catch((error) => console.error("Dashboard loading error:", error)).finally(() => setLoading(false));
  }, [fuel, period]);

  useEffect(() => {
    setLocationError(null);
    if (!("geolocation" in navigator)) {
      setLocationError("Браузърът не поддържа геолокация.");
      return;
    }
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => { setCoords({ lat: position.coords.latitude, lon: position.coords.longitude }); setLocationLoading(false); },
      () => { setLocationLoading(false); setLocationError("Няма разрешение за местоположение. Разреши Location или използвай бутона долу."); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    );
  }, []);

  useEffect(() => {
    if (!coords) return;
    const controller = new AbortController();
    setNearbyLoading(true);
    setNearby([]);
    fetch(`/api/prices/nearby?lat=${encodeURIComponent(coords.lat)}&lon=${encodeURIComponent(coords.lon)}&radius=${radius}&limit=10&fuel=${fuel}`, { signal: controller.signal })
      .then((r) => { if (!r.ok) throw new Error("Неуспешно зареждане на близките станции"); return r.json(); })
      .then((data) => setNearby(Array.isArray(data) ? data : []))
      .catch((error) => { if (error.name !== "AbortError") setLocationError("Неуспяхме да заредим близките станции."); })
      .finally(() => setNearbyLoading(false));
    return () => controller.abort();
  }, [coords, radius, fuel]);

  const movement = useMemo(() => {
    if (history.length < 2) return null;
    const first = history[0].average; const last = history.at(-1)!.average;
    if (!Number.isFinite(first) || first === 0 || !Number.isFinite(last)) return null;
    return { value: last - first, percent: ((last - first) / first) * 100 };
  }, [history]);
  const marketSignal = useMemo(() => {
    const good = news.filter((item) => item.impact === "GOOD").length; const bad = news.filter((item) => item.impact === "BAD").length;
    if (!news.length) return { label: "Няма достатъчно новини", tone: "neutral" as const };
    if (bad > good) return { label: "По-скоро натиск за поскъпване", tone: "bad" as const };
    if (good > bad) return { label: "По-скоро натиск за поевтиняване", tone: "good" as const };
    return { label: "Смесени пазарни сигнали", tone: "neutral" as const };
  }, [news]);
  const goodNews = news.filter((item) => item.impact === "GOOD").slice(0, 3);
  const badNews = news.filter((item) => item.impact === "BAD").slice(0, 3);
  const neutralNews = news.filter((item) => item.impact === "NEUTRAL" || !item.impact).slice(0, 2);
  const hasData = overview?.average != null;
  const useLocation = () => {
    setLocationError(null);
    if (!("geolocation" in navigator)) { setLocationError("Браузърът не поддържа геолокация."); return; }
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => { setCoords({ lat: position.coords.latitude, lon: position.coords.longitude }); setLocationLoading(false); },
      () => { setLocationLoading(false); setLocationError("Няма разрешение за местоположение. Разреши Location в браузъра и опитай отново."); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    );
  };
  const shownStations = coords ? nearby : [];

  return <main className="shell">
    <header><a className="brand" href="/">Fuel<span>Tracker</span><i>BG</i></a><nav><a className="active" href="#overview">Обзор</a><a href="#cheapest">Най-евтин</a><a href="#changes">Промени</a><a href="#forecast">Прогноза</a><a href="/admin">Админ</a></nav><button className="live"><b /> Данни на живо</button></header>
    <section className="fuel-selector" aria-label="Избор на гориво" style={{ margin: "28px 0 10px", padding: "18px 20px", background: "linear-gradient(133deg,#141f1d,#101817)", border: "1px solid #263331", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}><div style={{ minWidth: 220 }}><p className="eyebrow" style={{ marginBottom: 6 }}>ИЗБЕРИ ГОРИВО</p><h2 style={{ margin: 0, fontSize: 24, letterSpacing: "-1px" }}>{fuelLabel(fuel)}</h2><small style={{ display: "block", marginTop: 5, color: "#899691", fontSize: 12 }}>Избери горивото, за което искаш да виждаш цените, историята и най-евтините станции.</small></div><div className="fuel-options" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>{FUEL_OPTIONS.map((option) => { const selected = fuel === option.key; return <button key={option.key} type="button" onClick={() => setFuel(option.key)} aria-pressed={selected} style={{ appearance: "none", border: `1px solid ${selected ? "#607d45" : "#34443f"}`, background: selected ? "#27352f" : "#121b18", color: selected ? "#c8f65b" : "#9aa9a3", borderRadius: 999, padding: "9px 14px", minWidth: 76, cursor: "pointer", font: "600 12px 'DM Mono'", boxShadow: selected ? "0 0 0 1px #c8f65b22, 0 6px 18px #0003" : "none", transition: "all .18s ease" }}>{option.label}{option.key === "diesel" ? <span style={{ display: "block", font: "9px 'DM Mono'", opacity: .55, marginTop: 2 }}>по подразбиране</span> : null}</button>; })}</div></section>
    <section className="hero" id="overview"><div><p className="eyebrow">БЪЛГАРИЯ · {fuelLabel(fuel).toUpperCase()}</p><h1>Цената на <em>{fuelLabel(fuel).toLowerCase()},</em><br />без догадки.</h1><p className="lede">Показваме проследими цени с посочен източник и време на наблюдение.</p></div><div className="hero-chip"><span>Надеждност</span><strong>{overview?.confidence ?? "—"}{overview?.confidence != null && "%"}</strong><small>{overview?.stationCount ?? 0} валидни обекта</small></div></section>
    <section className="primary-card"><div className="price-head"><div><p>СРЕДНА ЦЕНА · {fuelLabel(fuel).toUpperCase()}</p><h2>{hasData ? fmt.format(overview!.average!) : "Няма данни"}<small>{hasData && " / литър"}</small></h2><div className={movement && movement.value >= 0 ? "movement up" : "movement down"}>{movement ? `${movement.value >= 0 ? "▲" : "▼"} ${fmt.format(Math.abs(movement.value))} · ${Math.abs(movement.percent).toFixed(1)}% за избрания период` : "Няма достатъчно история за тренд"}</div></div><div className="fresh"><span className={overview?.latest ? "dot fresh" : "dot"} />Последно обновяване: <b>{age(overview?.latest ?? null)}</b><small>{overview?.sourceCount ?? 0} потвърдени източника</small></div></div>
      <div className="periods">{[[1,"24ч"],[7,"7 дни"],[30,"30 дни"],[90,"3 мес"],[365,"1 год"]].map(([value,label]) => <button key={String(value)} onClick={() => setPeriod(Number(value))} className={period === value ? "selected" : ""}>{label}</button>)}</div>
      <div className="chart-wrap">{history.length ? <ResponsiveContainer width="100%" height={290}><AreaChart data={history}><defs><linearGradient id="fuel" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#bfef4b" stopOpacity=".36"/><stop offset="100%" stopColor="#bfef4b" stopOpacity="0"/></linearGradient></defs><CartesianGrid vertical={false} stroke="#23302f"/><XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: "#778481", fontSize: 11 }}/><YAxis domain={["dataMin - 0.01", "dataMax + 0.01"]} tickFormatter={(v) => `€${v.toFixed(2)}`} tickLine={false} axisLine={false} tick={{ fill: "#778481", fontSize: 11 }}/><Tooltip contentStyle={{ background: "#15201f", border: "1px solid #30413e", borderRadius: 10 }} formatter={(v) => fmt.format(Number(v))}/><Area type="monotone" dataKey="average" stroke="#c6f44d" strokeWidth={3} fill="url(#fuel)" /></AreaChart></ResponsiveContainer> : <Empty label={loading ? `Зареждаме ${fuelLabel(fuel)}…` : `Все още няма валидирани наблюдения за ${fuelLabel(fuel)}.`}/>}</div>
    </section>
    <section className="stats">{[["Средна", overview?.average], ["Най-ниска", overview?.lowest], ["Най-висока", overview?.highest], ["Медианна", overview?.median]].map(([label, value]) => <article key={String(label)}><span>{label}</span><strong>{typeof value === "number" ? fmt.format(value) : "—"}</strong><small>без аномални стойности</small></article>)}</section>
    <section className="grid"><article className="panel" id="cheapest"><div className="panel-title"><div><h3>НАЙ-ЕВТИН ДО ТЕБ · {fuelLabel(fuel).toUpperCase()}</h3>{coords ? <small style={{ opacity: 0.7 }}>сортирани по цена · {radius} km</small> : <small style={{ opacity: 0.7 }}>Нуждаем се от твоето местоположение</small>}</div><button type="button" onClick={useLocation} disabled={locationLoading}>{locationLoading ? "Зареждаме…" : "📍 Моето местоположение"}</button></div>
      <div className="periods">{[5,10,25,50].map((value) => <button key={value} onClick={() => setRadius(value)} className={radius === value ? "selected" : ""}>{value} km</button>)}</div>
      {locationError ? <div className="empty">◌ {locationError}</div> : null}
      {!coords && locationLoading ? <div className="empty">◌ Получаваме местоположението ти…</div> : null}
      {coords && nearbyLoading ? <div className="empty">◌ Търсим най-евтиния {fuelLabel(fuel).toLowerCase()} около теб…</div> : null}
      <div className="station-list">{shownStations.length ? shownStations.map((station, index) => <a key={station.id} className="station" href={station.sourceUrl} target="_blank" rel="noreferrer"><b>{String(index + 1).padStart(2,"0")}</b><div><strong>{station.brand && station.brand !== "gasstation" ? station.brand : station.name}</strong><span>{station.city} · {station.address} · {station.distanceKm.toFixed(2)} km</span></div><div className="station-price"><strong>{fmt.format(station.price)}</strong><span>{age(station.observedAt)}</span></div></a>) : null}</div>
      {!coords && !locationLoading && !locationError ? <div className="empty">◌ Разреши местоположението си, за да покажем най-евтиния {fuelLabel(fuel).toLowerCase()} около теб.</div> : null}
      {coords && !nearbyLoading && nearby.length === 0 && !locationError ? <div className="empty">◌ Няма станции с валидна цена в радиус {radius} km.</div> : null}
      <LocationMap latitude={coords?.lat ?? null} longitude={coords?.lon ?? null} radiusKm={radius} stations={shownStations}/></article>
      <article className="panel" id="changes"><div className="panel-title"><div><h3>ПОСЛЕДНИ ПРОМЕНИ</h3><small style={{ opacity: 0.7 }}>{marketSignal.label}</small></div><a href="#forecast">Прогноза →</a></div>
        {changes.length ? <div className="change-list">{changes.slice(0,3).map((change) => <a key={change.id} className="change" href={change.sourceUrl} target="_blank" rel="noreferrer"><div className={change.change >= 0 ? "arrow rise" : "arrow fall"}>{change.change >= 0 ? "↑" : "↓"}</div><div><strong>{change.station} <span>· {change.city}</span></strong><small>{fmt.format(change.oldPrice)} → {fmt.format(change.newPrice)} · {age(change.detectedAt)}</small></div><b className={change.change >= 0 ? "rise" : "fall"}>{change.change >= 0 ? "+" : ""}{fmt.format(change.change)}</b></a>)}</div> : null}
        {news.length ? <div className="news-summary">{goodNews.length ? <div className="news-group"><div className="news-label rise">🟢 ДОБРИ НОВИНИ</div>{goodNews.map((item) => <a className="news-item" key={item.id} href={item.url} target="_blank" rel="noreferrer"><strong>{item.title}</strong><span>{item.publisher} · {age(item.publishedAt)}</span></a>)}</div> : null}{badNews.length ? <div className="news-group"><div className="news-label fall">🔴 ЛОШИ НОВИНИ</div>{badNews.map((item) => <a className="news-item" key={item.id} href={item.url} target="_blank" rel="noreferrer"><strong>{item.title}</strong><span>{item.publisher} · {age(item.publishedAt)}</span></a>)}</div> : null}{!goodNews.length && !badNews.length && neutralNews.length ? <div className="news-group"><div className="news-label">⚪ НЕУТРАЛНО</div>{neutralNews.map((item) => <a className="news-item" key={item.id} href={item.url} target="_blank" rel="noreferrer"><strong>{item.title}</strong><span>{item.publisher} · {age(item.publishedAt)}</span></a>)}</div> : null}</div> : <Empty label="Все още няма събрани новини за пазара на горива."/>}
      </article></section>
    <DieselForecast />
    <footer>FUEL TRACKER BULGARIA <span>·</span> Цените се публикуват с източник, час и индикатор за свежест.</footer>
  </main>;
}
function Empty({ label }: { label: string }) { return <div className="empty"><span>◌</span>{label}</div>; }
