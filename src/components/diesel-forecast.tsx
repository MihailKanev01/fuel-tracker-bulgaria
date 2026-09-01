"use client";
import { useEffect, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type FuelKey = "diesel" | "a95" | "a100" | "lpg" | "cng";
type ForecastPoint = { date: string; low: number; expected: number; high: number; confidence: "HIGH" | "MEDIUM" | "LOW" };
type Forecast = { generatedAt: string; horizonDays: number; current: number | null; expectedEnd: number | null; expectedLow: number | null; expectedHigh: number | null; confidence: "HIGH" | "MEDIUM" | "LOW"; direction: "UP" | "DOWN" | "FLAT"; explanation: string; factors: Array<{ label: string; direction: "UP" | "DOWN" | "NEUTRAL"; weight: number }>; points: ForecastPoint[] };

const FUEL_LABELS: Record<FuelKey, string> = { diesel: "Diesel", a95: "A95", a100: "A100", lpg: "LPG", cng: "CNG" };
const fmt = new Intl.NumberFormat("bg-BG", { style: "currency", currency: "EUR", minimumFractionDigits: 3 });
const age = (value: string) => { const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000)); return minutes < 60 ? `преди ${minutes} мин` : minutes < 1440 ? `преди ${Math.round(minutes / 60)} ч` : `преди ${Math.round(minutes / 1440)} дни`; };
const confidenceLabel = { HIGH: "Висока", MEDIUM: "Средна", LOW: "Ниска" } as const;
const directionLabel = { UP: "Очаква се ръст", DOWN: "Очаква се спад", FLAT: "Очаква се стабилност" } as const;

export function DieselForecast({ fuel = "diesel" }: { fuel?: FuelKey }) {
  const [data, setData] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setData(null);
    fetch(`/api/fuels/${fuel}/forecast`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error("forecast failed"); return response.json(); })
      .then((json) => setData(json))
      .catch((error) => { if (error.name !== "AbortError") setData(null); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [fuel]);

  const fuelLabel = FUEL_LABELS[fuel];
  if (loading) return <div className="forecast-panel panel"><div className="forecast-empty">◌ Изчисляваме прогнозата за {fuelLabel}…</div></div>;
  if (!data?.points.length || data.current == null) return <div className="forecast-panel panel"><div className="forecast-empty">◌ Няма достатъчно проверени данни за надеждна прогноза за {fuelLabel}.</div></div>;

  return <section className="forecast-panel panel" id="forecast">
    <div className="forecast-head">
      <div>
        <p className="eyebrow">ОЧАКВАНА ЦЕНА · {fuelLabel.toUpperCase()}</p>
        <h3>Следващите {data.horizonDays} дни</h3>
        <p className="forecast-subtitle">Базов сценарий с диапазон, а не фиксирана обещана цена.</p>
      </div>
      <div className={`forecast-direction ${data.direction.toLowerCase()}`}><strong>{directionLabel[data.direction]}</strong><span>Увереност: {confidenceLabel[data.confidence]}</span></div>
    </div>
    <div className="forecast-chart">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data.points} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
          <CartesianGrid vertical={false} stroke="#23302f" />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: "#778481", fontSize: 11 }} />
          <YAxis domain={["dataMin - 0.01", "dataMax + 0.01"]} tickFormatter={(value) => `€${Number(value).toFixed(2)}`} tickLine={false} axisLine={false} tick={{ fill: "#778481", fontSize: 11 }} />
          <Tooltip contentStyle={{ background: "#15201f", border: "1px solid #30413e", borderRadius: 10 }} labelFormatter={(value) => `Дата: ${value}`} formatter={(value, name) => [fmt.format(Number(value)), name === "expected" ? "Очаквано" : name === "low" ? "Долен диапазон" : "Горен диапазон"]} />
          <Legend wrapperStyle={{ fontSize: 11, color: "#899691", fontFamily: "DM Mono" }} />
          <Line type="monotone" dataKey="expected" name="Очаквано" stroke="#c8f65b" strokeWidth={3} dot={false} />
          <Line type="monotone" dataKey="low" name="Нисък сценарий" stroke="#61766c" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
          <Line type="monotone" dataKey="high" name="Висок сценарий" stroke="#61766c" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
    <div className="forecast-metrics"><div><span>Сега</span><strong>{fmt.format(data.current)}</strong></div><div><span>Ден 7</span><strong>{fmt.format(data.expectedEnd ?? data.current)}</strong></div><div><span>Диапазон</span><strong>{fmt.format(data.expectedLow ?? data.current)} — {fmt.format(data.expectedHigh ?? data.current)}</strong></div><div><span>Последен анализ</span><strong>{age(data.generatedAt)}</strong></div></div>
    <div className="forecast-factors">{data.factors.map((factor) => <span key={factor.label} className={`factor ${factor.direction.toLowerCase()}`}>{factor.direction === "UP" ? "↑" : factor.direction === "DOWN" ? "↓" : "→"} {factor.label}</span>)}</div>
    <p className="forecast-note">{data.explanation} Прогнозата се преизчислява при следващото обновяване на данните.</p>
  </section>;
}
