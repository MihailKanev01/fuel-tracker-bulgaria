"use client";

import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { age } from "@/lib/dashboard-utils";
import { DieselForecast } from "./diesel-forecast";
import { ThemeToggle } from "./theme-toggle";
import { FUEL_OPTIONS } from "@/lib/fuel";
import { NearbyStations } from "./nearby-stations";
import { useFuelPreferences } from "@/hooks/use-fuel-preferences";
import { AlertCenter } from "./alert-center";
import { FuelCalculator } from "./fuel-calculator";
import { TripPlanner } from "./trip-planner";

const fmt = new Intl.NumberFormat("bg-BG", { style: "currency", currency: "EUR", minimumFractionDigits: 3 });

export function Dashboard() {
  const {
    fuel,
    setFuel,
    period,
    setPeriod,
    radius,
    setRadius,
    quantity,
    setQuantity,
    consumption,
    setConsumption,
    favorites,
    toggleFavorite,
    updateFavoriteFromLive,
  } = useFuelPreferences();

  const {
    overview,
    history,
    nearby,
    goodNews,
    badNews,
    coords,
    locationLoading,
    nearbyLoading,
    locationError,
    loading,
    dataError,
    refreshLocation,
    fuelLabel: label,
  } = useDashboardData({ fuel, period, radius });

  const movement = useMemo(() => {
    if (history.length < 2) return null;
    const first = history[0].average;
    const last = history.at(-1)!.average;
    if (!Number.isFinite(first) || first === 0 || !Number.isFinite(last)) return null;
    return { value: last - first, percent: ((last - first) / first) * 100 };
  }, [history]);

  const hasData = overview?.average != null;

  const cheapestNearby = useMemo(
    () => nearby.length ? nearby.reduce((best, station) => station.price < best.price ? station : best) : null,
    [nearby],
  );

return <main className="shell">
    <header><a className="brand" href="/">Fuel<span>Tracker</span><i>BG</i></a><nav><a className="active" href="#overview">Обзор</a><a href="#cheapest">Най-евтин</a><a href="#changes">Промени</a><a href="#trip">Пътуване</a><a href="/admin">Админ</a></nav><div className="header-actions"><ThemeToggle /><button className="live"><b /> Данни на живо</button></div></header>
    <section className="fuel-selector-section"><div><p className="eyebrow">ИЗБЕРИ ГОРИВО</p><div className="fuel-selector">{FUEL_OPTIONS.map((option) => <button key={option.key} type="button" className={fuel === option.key ? "selected" : ""} onClick={() => setFuel(option.key)}>{option.label}</button>)}</div></div></section>
    {dataError ? <div className="empty" role="status">◌ {dataError}</div> : null}
    <section className="hero" id="overview"><div><p className="eyebrow">БЪЛГАРИЯ · {label.toUpperCase()}</p><h1>Цената на <em>{label.toLowerCase()},</em><br />без догадки.</h1><p className="lede">Показваме само проследими цени с посочен източник и време на наблюдение.</p></div><div className="hero-chip"><span>Надеждност</span><strong>{overview?.confidence ?? "—"}{overview?.confidence != null && "%"}</strong><small>{overview?.stationCount ?? 0} валидни обекта</small></div></section>
    <section className="primary-card"><div className="price-head"><div><p>СРЕДНА ЦЕНА · {label.toUpperCase()}</p><h2>{hasData ? fmt.format(overview!.average!) : "Няма данни"}<small>{hasData && " / литър"}</small></h2><div className={movement && movement.value >= 0 ? "movement up" : "movement down"}>{movement ? `${movement.value >= 0 ? "▲" : "▼"} ${fmt.format(Math.abs(movement.value))} · ${Math.abs(movement.percent).toFixed(1)}% за избрания период` : "Няма достатъчно история за тренд"}</div></div><div className="fresh"><span className={overview?.latest ? "dot fresh" : "dot"} />Последно обновяване: <b>{age(overview?.latest ?? null)}</b><small>{overview?.sourceCount ?? 0} потвърдени източника</small></div></div>
      <div className="periods">{[[1,"24ч"],[7,"7 дни"],[30,"30 дни"],[90,"3 мес"],[365,"1 год"]].map(([value,labelText]) => <button key={String(value)} onClick={() => setPeriod(Number(value))} className={period === value ? "selected" : ""}>{labelText}</button>)}</div>
      <div className="chart-wrap">{history.length ? <ResponsiveContainer width="100%" height={290}><AreaChart data={history}><defs><linearGradient id="fuel" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#bfef4b" stopOpacity=".36"/><stop offset="100%" stopColor="#bfef4b" stopOpacity="0"/></linearGradient></defs><CartesianGrid vertical={false} stroke="#23302f"/><XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: "#778481", fontSize: 11 }}/><YAxis domain={["dataMin - 0.01", "dataMax + 0.01"]} tickFormatter={(v) => `€${v.toFixed(2)}`} tickLine={false} axisLine={false} tick={{ fill: "#778481", fontSize: 11 }}/><Tooltip contentStyle={{ background: "#15201f", border: "1px solid #30413e", borderRadius: 10 }} formatter={(v) => fmt.format(Number(v))}/><Area type="monotone" dataKey="average" stroke="#c6f44d" strokeWidth={3} fill="url(#fuel)" /></AreaChart></ResponsiveContainer> : <Empty label={loading ? "Зареждаме потвърдените наблюдения…" : "Все още няма валидирани ценови наблюдения за този период."}/>}</div>
    </section>
    <section className="stats">{[["Средна", overview?.average],["Най-ниска", overview?.lowest],["Най-висока", overview?.highest],["Медианна", overview?.median]].map(([labelText, value]) => <article key={String(labelText)}><span>{labelText}</span><strong>{typeof value === "number" ? fmt.format(value) : "—"}</strong><small>без аномални стойности</small></article>)}</section>
    <section className="grid">      <NearbyStations
        fuel={fuel}
        fuelLabel={label}
        radius={radius}
        setRadius={setRadius}
        stations={nearby}
        coords={coords}
        locationLoading={locationLoading}
        nearbyLoading={nearbyLoading}
        locationError={locationError}
        refreshLocation={refreshLocation}
        quantity={quantity}
        setQuantity={setQuantity}
        consumption={consumption}
        setConsumption={setConsumption}
        favorites={favorites}
        onToggleFavorite={toggleFavorite}
        onUpdateFavorite={updateFavoriteFromLive}
      />
<article className="panel" id="changes"><div className="panel-title"><h3>ПОСЛЕДНИ НОВИНИ · {label.toUpperCase()}</h3><a href="#">Цял журнал →</a></div><div className="news-summary"><div className="news-group"><div className="news-label up">ДОБРИ НОВИНИ</div>{goodNews.length ? goodNews.map((item)=><a key={item.id} className="news-item" href={item.url} target="_blank" rel="noreferrer"><strong>{item.title}</strong><span>{item.publisher} · {age(item.publishedAt)}</span></a>) : <div className="empty">Няма достатъчно добри релевантни новини за {label}.</div>}</div><div className="news-group"><div className="news-label down">ЛОШИ НОВИНИ</div>{badNews.length ? badNews.map((item)=><a key={item.id} className="news-item" href={item.url} target="_blank" rel="noreferrer"><strong>{item.title}</strong><span>{item.publisher} · {age(item.publishedAt)}</span></a>) : <div className="empty">Няма достатъчно лоши релевантни новини за {label}.</div>}</div></div></article></section>
    <DieselForecast fuel={fuel}/>
    <FuelCalculator
      fuel={fuel}
      fuelLabel={label}
      averagePrice={overview?.average ?? null}
      cheapestNearby={cheapestNearby?.price ?? null}
      cheapestNearbyName={cheapestNearby ? (cheapestNearby.brand ?? cheapestNearby.name) : null}
      quantity={quantity}
      consumption={consumption}
    />
    <TripPlanner
      coords={coords}
      fuel={fuel}
      quantity={quantity}
      consumption={consumption}
      fuelLabel={label}
    />
    <section className="insight"><div className="signal">⌁</div><div><p className="eyebrow">ПАЗАРЕН КОНТЕКСТ</p><h3>Какво движи {label.toLowerCase()}?</h3><p>Тази секция показва проверени факти от свързани пазарни източници. Причинно-следствени изводи не се правят, докато данните не са достатъчни.</p></div><span className="pending">Очаква пазарни данни</span></section><footer>FUEL TRACKER BULGARIA <span>·</span> Цените се публикуват с източник, час и индикатор за свежест.</footer>
  </main>;
}
function Empty({label}:{label:string}){return <div className="empty"><span>◌</span>{label}</div>;
}
