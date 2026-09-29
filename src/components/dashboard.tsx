"use client";

import { useMemo, useState } from "react";
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

const fmt = new Intl.NumberFormat("bg-BG", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 3,
});

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

  const [trendView, setTrendView] = useState<"history" | "forecast">("history");

  const movement = useMemo(() => {
    if (history.length < 2) return null;
    const first = history[0].average;
    const last = history.at(-1)!.average;
    if (!Number.isFinite(first) || first === 0 || !Number.isFinite(last)) return null;
    return { value: last - first, percent: ((last - first) / first) * 100 };
  }, [history]);

  const hasData = overview?.average != null;
  const cheapestNearby = useMemo(
    () => nearby.length
      ? nearby.reduce((best, station) => station.price < best.price ? station : best)
      : null,
    [nearby],
  );

  const relevantNews = [...goodNews, ...badNews].slice(0, 4);

  return (
    <main className="shell">
      <header className="site-header">
        <a className="brand" href="/">Fuel<span>Tracker</span><i>BG</i></a>
        <nav aria-label="Основна навигация">
          <a className="active" href="#overview">Обзор</a>
          <a href="#cheapest">Станции</a>
          <a href="#tools">Инструменти</a>
          <a href="#changes">Новини</a>
          <a href="/admin">Админ</a>
        </nav>
        <div className="header-actions">
          <ThemeToggle />
          <span className="live"><b /> Данни на живо</span>
        </div>
      </header>

      <section className="fuel-selector-section compact-fuel-selector">
        <div className="fuel-selector-wrap">
          <p className="eyebrow">ГОРИВО</p>
          <div className="fuel-selector" role="group" aria-label="Избор на гориво">
            {FUEL_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                className={fuel === option.key ? "selected" : ""}
                onClick={() => setFuel(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="location-pill">
          <span className="dot fresh" />
          {coords ? "Локацията е активна" : locationLoading ? "Намираме те…" : "Локацията не е налична"}
        </div>
      </section>

      {dataError ? <div className="empty inline-status" role="status">◌ {dataError}</div> : null}

      <section className="hero hero-compact" id="overview">
        <div className="hero-main">
          <p className="eyebrow">БЪЛГАРИЯ · {label.toUpperCase()}</p>
          <h1><em>{hasData ? fmt.format(overview!.average!) : "—"}</em><small> / литър</small></h1>
          <div className={movement && movement.value >= 0 ? "movement up" : "movement down"}>
            {movement
              ? (movement.value >= 0 ? "▲ " : "▼ ") + fmt.format(Math.abs(movement.value)) + " · " + Math.abs(movement.percent).toFixed(1) + "% за " + period + " дни"
              : "Няма достатъчно история за тренд"}
          </div>
        </div>

        <div className="hero-side-summary">
          <div>
            <span>Най-ниска</span>
            <strong>{overview?.lowest != null ? fmt.format(overview.lowest) : "—"}</strong>
          </div>
          <div>
            <span>Най-евтина наблизо</span>
            <strong>{cheapestNearby ? fmt.format(cheapestNearby.price) : "—"}</strong>
          </div>
          <div>
            <span>Обновяване</span>
            <strong>{age(overview?.latest ?? null)}</strong>
          </div>
        </div>
      </section>

      <section className="primary-card trend-card">
        <div className="trend-head">
          <div>
            <p className="eyebrow">{trendView === "history" ? "ИСТОРИЯ НА ЦЕНАТА" : "ПРОГНОЗА НА ЦЕНАТАТА"}</p>
            <h2>{trendView === "history" ? label + " през времето" : "Очаквана посока за следващите дни"}</h2>
          </div>
          <div className="trend-tabs" role="tablist" aria-label="История и прогноза">
            <button type="button" className={trendView === "history" ? "selected" : ""} onClick={() => setTrendView("history")}>История</button>
            <button type="button" className={trendView === "forecast" ? "selected" : ""} onClick={() => setTrendView("forecast")}>Прогноза</button>
          </div>
        </div>

        {trendView === "history" ? (
          <>
            <div className="trend-period-row">
              <div className="periods trend-periods">
                {[[1, "24ч"], [7, "7 дни"], [30, "30 дни"], [90, "3 мес"], [365, "1 год"]].map(([value, text]) => (
                  <button
                    key={String(value)}
                    type="button"
                    onClick={() => setPeriod(Number(value))}
                    className={period === value ? "selected" : ""}
                  >
                    {text}
                  </button>
                ))}
              </div>
              <div className="trend-stat">
                <span>Валидни обекти</span>
                <strong>{overview?.stationCount ?? 0}</strong>
              </div>
            </div>

            <div className="chart-wrap compact-chart">
              {history.length ? (
                <ResponsiveContainer width="100%" height={290}>
                  <AreaChart data={history} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                    <defs>
                      <linearGradient id="fuel" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#bfef4b" stopOpacity=".28" />
                        <stop offset="100%" stopColor="#bfef4b" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#23302f" />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: "#778481", fontSize: 11 }} />
                    <YAxis
                      domain={["dataMin - 0.01", "dataMax + 0.01"]}
                      tickFormatter={(value) => "€" + Number(value).toFixed(2)}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#778481", fontSize: 11 }}
                    />
                    <Tooltip
                      contentStyle={{ background: "#15201f", border: "1px solid #30413e", borderRadius: 10 }}
                      labelFormatter={(value) => "Дата: " + value}
                      formatter={(value) => fmt.format(Number(value))}
                    />
                    <Area type="monotone" dataKey="average" stroke="#c6f44d" strokeWidth={3} fill="url(#fuel)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <Empty label={loading ? "Зареждаме потвърдените наблюдения…" : "Все още няма валидирана история за този период."} />
              )}
            </div>

            <div className="stats compact-stats">
              {[
                ["Средна", overview?.average],
                ["Най-ниска", overview?.lowest],
                ["Най-висока", overview?.highest],
                ["Медианна", overview?.median],
              ].map(([statLabel, value]) => (
                <article key={String(statLabel)}>
                  <span>{statLabel}</span>
                  <strong>{typeof value === "number" ? fmt.format(value) : "—"}</strong>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="forecast-host">
            <DieselForecast fuel={fuel} />
          </div>
        )}
      </section>

      <section className="content-section" id="cheapest">
        <NearbyStations
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
      </section>

      <section className="tools-section" id="tools">
        <div className="section-intro">
          <div>
            <p className="eyebrow">ПОЛЕЗНИ ИНСТРУМЕНТИ</p>
            <h2>Само когато ти потрябват.</h2>
          </div>
          <p>Допълнителните функции са прибрани в компактни панели, за да остане началната страница фокусирана.</p>
        </div>

        <div className="tool-disclosures">
          <details className="tool-disclosure">
            <summary>
              <span><i>01</i><strong>Моята кола</strong></span>
              <small>Разход · месечен бюджет · резервоар</small>
            </summary>
            <div className="tool-body">
              <FuelCalculator
                fuel={fuel}
                fuelLabel={label}
                averagePrice={overview?.average ?? null}
                cheapestNearby={cheapestNearby?.price ?? null}
                cheapestNearbyName={cheapestNearby ? (cheapestNearby.brand ?? cheapestNearby.name) : null}
                quantity={quantity}
                consumption={consumption}
              />
            </div>
          </details>

          <details className="tool-disclosure">
            <summary>
              <span><i>02</i><strong>Пътуване</strong></span>
              <small>Маршрут · станции · отклонение · цена</small>
            </summary>
            <div className="tool-body">
              <TripPlanner
                coords={coords}
                fuel={fuel}
                quantity={quantity}
                consumption={consumption}
                fuelLabel={label}
              />
            </div>
          </details>

          <details className="tool-disclosure">
            <summary>
              <span><i>03</i><strong>Известия</strong></span>
              <small>Следи цената на любимите ти станции</small>
            </summary>
            <div className="tool-body">
              <AlertCenter />
            </div>
          </details>
        </div>
      </section>

      <section className="news-section" id="changes">
        <div className="news-section-head">
          <div>
            <p className="eyebrow">ПОСЛЕДНИ НОВИНИ · {label.toUpperCase()}</p>
            <h2>Пазарът накратко.</h2>
          </div>
          <span>{relevantNews.length} публикации</span>
        </div>

        <div className="news-compact-grid">
          {relevantNews.map((item) => (
            <a key={item.id} className="news-compact-item" href={item.url} target="_blank" rel="noreferrer">
              <strong>{item.title}</strong>
              <span>{item.publisher} · {age(item.publishedAt)}</span>
            </a>
          ))}
          {!relevantNews.length ? <div className="empty news-empty">Няма достатъчно релевантни новини за {label}.</div> : null}
        </div>
      </section>

      <footer>FUEL TRACKER BULGARIA <span>·</span> Цените се публикуват с източник, час и индикатор за свежест.</footer>
    </main>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="empty"><span>◌</span>{label}</div>;
}
