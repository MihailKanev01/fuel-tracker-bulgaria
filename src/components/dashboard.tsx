"use client";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Overview = { average: number | null; lowest: number | null; highest: number | null; median: number | null; stationCount: number; sourceCount: number; confidence: number | null; latest: string | null };
type Point = { date: string; average: number; minimum: number; maximum: number };
type Station = { id: string; name: string; brand: string | null; city: string; address: string; price: number; observedAt: string; confidence: number; sourceUrl: string; latitude: number | null; longitude: number | null };
type NearbyStation = Station & { distanceKm: number };
type Change = { id: string; station: string; city: string; oldPrice: number; newPrice: number; change: number; percent: number; detectedAt: string; sourceUrl: string };

const fmt = new Intl.NumberFormat("bg-BG", { style: "currency", currency: "EUR", minimumFractionDigits: 3 });
const age = (value: string | null) => { if (!value) return "Няма данни"; const date = new Date(value); if (Number.isNaN(date.getTime())) return "Няма данни"; const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000)); return minutes < 60 ? `преди ${minutes} мин` : minutes < 1440 ? `преди ${Math.round(minutes / 60)} ч` : `преди ${Math.round(minutes / 1440)} дни`; };

export function Dashboard() {
  const [period, setPeriod] = useState(30);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [history, setHistory] = useState<Point[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [nearby, setNearby] = useState<NearbyStation[]>([]);
  const [changes, setChanges] = useState<Change[]>([]);
  const [radius, setRadius] = useState(25);
  const [locationLoading, setLocationLoading] = useState(false);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/fuels/diesel").then((r) => r.json()),
      fetch(`/api/fuels/diesel/history?days=${period}`).then((r) => r.json()),
      fetch("/api/prices/cheapest?limit=5").then((r) => r.json()),
      fetch("/api/prices/changes").then((r) => r.json()),
    ]).then(([a, b, c, d]) => {
      setOverview(a);
      setHistory(b);
      setStations(c);
      setChanges(d);
    }).catch((error) => console.error("Dashboard loading error:", error)).finally(() => setLoading(false));
  }, [period]);

  useEffect(() => {
    setLocationError(null);
    if (!("geolocation" in navigator)) {
      setLocationError("Браузърът не поддържа геолокация.");
      return;
    }

    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lon: position.coords.longitude });
        setLocationLoading(false);
      },
      () => {
        setLocationLoading(false);
        setLocationError("Няма разрешение за местоположение. Разреши Location или използвай бутона долу.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    );
  }, []);

  useEffect(() => {
    if (!coords) return;
    const controller = new AbortController();
    setNearbyLoading(true);
    setNearby([]);
    fetch(`/api/prices/nearby?lat=${encodeURIComponent(coords.lat)}&lon=${encodeURIComponent(coords.lon)}&radius=${radius}&limit=10`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error("Неуспешно зареждане на близките станции");
        return r.json();
      })
      .then((data) => {
        setNearby(Array.isArray(data) ? data : []);
      })
      .catch((error) => {
        if (error.name !== "AbortError") setLocationError("Неуспяхме да заредим близките станции.");
      })
      .finally(() => setNearbyLoading(false));
    return () => controller.abort();
  }, [coords, radius]);

  const movement = useMemo(() => {
    if (history.length < 2) return null;
    const first = history[0].average;
    const last = history.at(-1)!.average;
    if (!Number.isFinite(first) || first === 0 || !Number.isFinite(last)) return null;
    return { value: last - first, percent: ((last - first) / first) * 100 };
  }, [history]);

  const hasData = overview?.average != null;

  const useLocation = () => {
    setLocationError(null);
    if (!("geolocation" in navigator)) {
      setLocationError("Браузърът не поддържа геолокация.");
      return;
    }
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lon: position.coords.longitude });
        setLocationLoading(false);
      },
      () => {
        setLocationLoading(false);
        setLocationError("Няма разрешение за местоположение. Разреши Location в браузъра и опитай отново.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    );
  };

  const shownStations = coords ? nearby : [];

  return <main className="shell">
    <header><a className="brand" href="/">Fuel<span>Tracker</span><i>BG</i></a><nav><a className="active" href="#overview">Обзор</a><a href="#cheapest">Най-евтин</a><a href="#changes">Промени</a><a href="#market">Пазар</a><a href="/admin">Админ</a></nav><button className="live"><b /> Данни на живо</button></header>
    <section className="hero" id="overview"><div><p className="eyebrow">БЪЛГАРИЯ · DIESEL</p><h1>Цената на <em>дизела,</em><br />без догадки.</h1><p className="lede">Показваме проследими цени с посочен източник и време на наблюдение.</p></div><div className="hero-chip"><span>Надеждност</span><strong>{overview?.confidence ?? "—"}{overview?.confidence != null && "%"}</strong><small>{overview?.stationCount ?? 0} валидни обекта</small></div></section>
    <section className="primary-card"><div className="price-head"><div><p>СРЕДНА ЦЕНА · DIESEL</p><h2>{hasData ? fmt.format(overview!.average!) : "Няма данни"}<small>{hasData && " / литър"}</small></h2><div className={movement && movement.value >= 0 ? "movement up" : "movement down"}>{movement ? `${movement.value >= 0 ? "▲" : "▼"} ${fmt.format(Math.abs(movement.value))} · ${Math.abs(movement.percent).toFixed(1)}% за избрания период` : "Няма достатъчно история за тренд"}</div></div><div className="fresh"><span className={overview?.latest ? "dot fresh" : "dot"} />Последно обновяване: <b>{age(overview?.latest ?? null)}</b><small>{overview?.sourceCount ?? 0} потвърдени източника</small></div></div>
      <div className="periods">{[[1,"24ч"],[7,"7 дни"],[30,"30 дни"],[90,"3 мес"],[365,"1 год"]].map(([value,label]) => <button key={String(value)} onClick={() => setPeriod(Number(value))} className={period === value ? "selected" : ""}>{label}</button>)}</div>
      <div className="chart-wrap">{history.length ? <ResponsiveContainer width="100%" height={290}><AreaChart data={history}><defs><linearGradient id="fuel" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#bfef4b" stopOpacity=".36"/><stop offset="100%" stopColor="#bfef4b" stopOpacity="0"/></linearGradient></defs><CartesianGrid vertical={false} stroke="#23302f"/><XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: "#778481", fontSize: 11 }}/><YAxis domain={["dataMin - 0.01", "dataMax + 0.01"]} tickFormatter={(v) => `€${v.toFixed(2)}`} tickLine={false} axisLine={false} tick={{ fill: "#778481", fontSize: 11 }}/><Tooltip contentStyle={{ background: "#15201f", border: "1px solid #30413e", borderRadius: 10 }} formatter={(v) => fmt.format(Number(v))}/><Area type="monotone" dataKey="average" stroke="#c6f44d" strokeWidth={3} fill="url(#fuel)" /></AreaChart></ResponsiveContainer> : <Empty label={loading ? "Зареждаме потвърдените наблюдения…" : "Все още няма валидирани ценови наблюдения за този период."}/>}</div>
    </section>
    <section className="stats">{[["Средна", overview?.average], ["Най-ниска", overview?.lowest], ["Най-висока", overview?.highest], ["Медианна", overview?.median]].map(([label, value]) => <article key={String(label)}><span>{label}</span><strong>{typeof value === "number" ? fmt.format(value) : "—"}</strong><small>без аномални стойности</small></article>)}</section>
    <section className="grid"><article className="panel" id="cheapest"><div className="panel-title"><div><h3>НАЙ-ЕВТИН ДО ТЕБ</h3>{coords ? <small style={{ opacity: 0.7 }}>сортирани по цена · {radius} km</small> : <small style={{ opacity: 0.7 }}>Нуждаем се от твоето местоположение</small>}</div><button type="button" onClick={useLocation} disabled={locationLoading}>{locationLoading ? "Зареждаме…" : "📍 Моето местоположение"}</button></div>
      <div className="periods">{[5,10,25,50].map((value) => <button key={value} onClick={() => setRadius(value)} className={radius === value ? "selected" : ""}>{value} km</button>)}</div>
      {locationError ? <div className="empty">◌ {locationError}</div> : null}
      {!coords && locationLoading ? <div className="empty">◌ Получаваме местоположението ти…</div> : null}
      {coords && nearbyLoading ? <div className="empty">◌ Търсим най-евтиния дизел около теб…</div> : null}
      <div className="station-list">{shownStations.length ? shownStations.map((station, index) => <a key={station.id} className="station" href={station.sourceUrl} target="_blank" rel="noreferrer"><b>{String(index + 1).padStart(2,"0")}</b><div><strong>{station.brand && station.brand !== "gasstation" ? station.brand : station.name}</strong><span>{station.city} · {station.address} · {station.distanceKm} km</span></div><div className="station-price"><strong>{fmt.format(station.price)}</strong><span>{age(station.observedAt)}</span></div></a>) : null}</div>
      {!coords && !locationLoading && !locationError ? <div className="empty">◌ Разреши местоположението си, за да покажем най-евтиния дизел около теб.</div> : null}
      {coords && !nearbyLoading && nearby.length === 0 && !locationError ? <div className="empty">◌ Няма станции с валидна цена в радиус {radius} km.</div> : null}
      <FuelMap stations={shownStations}/></article>
      <article className="panel" id="changes"><PanelTitle label="ПОСЛЕДНИ ПРОМЕНИ" action="Цял журнал →"/><div className="change-list">{changes.length ? changes.slice(0,5).map((change) => <a key={change.id} className="change" href={change.sourceUrl} target="_blank" rel="noreferrer"><div className={change.change >= 0 ? "arrow rise" : "arrow fall"}>{change.change >= 0 ? "↑" : "↓"}</div><div><strong>{change.station} <span>· {change.city}</span></strong><small>{fmt.format(change.oldPrice)} → {fmt.format(change.newPrice)} · {age(change.detectedAt)}</small></div><b className={change.change >= 0 ? "rise" : "fall"}>{change.change >= 0 ? "+" : ""}{fmt.format(change.change)}</b></a>) : <Empty label="Ще се появят при първата открита промяна."/>}</div></article></section>
    <section className="insight" id="market"><div className="signal">⌁</div><div><p className="eyebrow">ПАЗАРЕН КОНТЕКСТ</p><h3>Какво движи дизела?</h3><p>Тази секция показва проверени факти от свързани пазарни източници. Причинно-следствени изводи не се правят, докато данните не са достатъчни.</p></div><span className="pending">Пазарни данни активни</span></section>
    <footer>FUEL TRACKER BULGARIA <span>·</span> Цените се публикуват с източник, час и индикатор за свежест.</footer>
  </main>;
}
function PanelTitle({ label, action }: { label: string; action: string }) { return <div className="panel-title"><h3>{label}</h3><a href="#">{action}</a></div>; }
function Empty({ label }: { label: string }) { return <div className="empty"><span>◌</span>{label}</div>; }
function FuelMap({ stations }: { stations: Station[] | NearbyStation[] }) { const mapped = stations.filter((station) => station.latitude != null && station.longitude != null).map((station) => ({ ...station, x: ((station.longitude! - 22) / 7.2) * 100, y: 100 - ((station.latitude! - 41) / 3.8) * 100 })).filter((station) => station.x >= 0 && station.x <= 100 && station.y >= 0 && station.y <= 100); return <div className="fuel-map" aria-label="Карта с публикуваните цени"><svg viewBox="0 0 400 180" preserveAspectRatio="none" aria-hidden="true"><path d="M16 64L45 35L105 28L142 45L182 26L226 45L283 30L330 51L378 47L385 89L357 115L309 122L274 145L226 133L177 151L136 134L95 147L53 125L22 101Z" /></svg>{mapped.map((station) => <a key={station.id} href={station.sourceUrl} target="_blank" rel="noreferrer" className="map-pin" style={{ left: `${station.x}%`, top: `${station.y}%` }} title={`${station.name}: ${fmt.format(station.price)}`}><span>{fmt.format(station.price)}</span></a>)}<p>{mapped.length ? "Маркерите са позиционирани по GPS от източника." : "Картата ще се активира след получаване на местоположение..."}</p></div>; }
