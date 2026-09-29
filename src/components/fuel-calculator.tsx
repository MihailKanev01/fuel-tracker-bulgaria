"use client";

import { useEffect, useMemo, useState } from "react";
import type { FuelKey } from "@/lib/fuel";

type CarProfile = {
  name: string;
  tankCapacity: number;
  fuelInTank: number;
  monthlyKm: number;
};

const STORAGE_KEY = "fueltracker-my-car-v1";
const defaults: CarProfile = { name: "", tankCapacity: 55, fuelInTank: 25, monthlyKm: 1000 };

const money = new Intl.NumberFormat("bg-BG", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
const money3 = new Intl.NumberFormat("bg-BG", { style: "currency", currency: "EUR", minimumFractionDigits: 3 });

function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }

function readCar(): CarProfile {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<CarProfile>;
    return {
      name: typeof parsed.name === "string" ? parsed.name.slice(0, 60) : defaults.name,
      tankCapacity: typeof parsed.tankCapacity === "number" ? clamp(parsed.tankCapacity, 20, 150) : defaults.tankCapacity,
      fuelInTank: typeof parsed.fuelInTank === "number" ? clamp(parsed.fuelInTank, 0, 150) : defaults.fuelInTank,
      monthlyKm: typeof parsed.monthlyKm === "number" ? clamp(parsed.monthlyKm, 0, 10000) : defaults.monthlyKm,
    };
  } catch {
    return defaults;
  }
}

function fuelLabelFor(fuel: FuelKey) {
  return { diesel: "Diesel", a95: "A95", a100: "A100", lpg: "LPG", cng: "CNG" }[fuel];
}

export function FuelCalculator({ fuel, fuelLabel, averagePrice, cheapestNearby, cheapestNearbyName, quantity, consumption }: {
  fuel: FuelKey; fuelLabel: string; averagePrice: number | null; cheapestNearby: number | null; cheapestNearbyName: string | null; quantity: number; consumption: number;
}) {
  const [car, setCar] = useState<CarProfile>(defaults);
  const [hydrated, setHydrated] = useState(false);
  const [price, setPrice] = useState<number>(averagePrice ?? cheapestNearby ?? 0);
  const [priceTouched, setPriceTouched] = useState(false);
  const [distance, setDistance] = useState(100);
  const [roundTrip, setRoundTrip] = useState(false);

  useEffect(() => { setCar(readCar()); setHydrated(true); }, []);
  useEffect(() => { if (!priceTouched) { const next = averagePrice ?? cheapestNearby; if (next != null) setPrice(next); } }, [averagePrice, cheapestNearby, priceTouched]);
  useEffect(() => { if (!hydrated) return; try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(car)); } catch { /* optional storage */ } }, [car, hydrated]);

  const litersForTrip = useMemo(() => distance * (consumption / 100) * (roundTrip ? 2 : 1), [distance, consumption, roundTrip]);
  const tripCost = litersForTrip * price;
  const fuelInTank = Math.min(car.fuelInTank, car.tankCapacity);
  const fillLiters = Math.max(0, car.tankCapacity - fuelInTank);
  const fillCost = fillLiters * price;
  const monthlyLiters = car.monthlyKm * (consumption / 100);
  const monthlyCost = monthlyLiters * price;
  const savingsVsAverage = cheapestNearby != null && averagePrice != null ? Math.max(0, averagePrice - cheapestNearby) * quantity : null;

  const updateCar = <K extends keyof CarProfile>(key: K, value: CarProfile[K]) => { setCar((current) => ({ ...current, [key]: value })); };

  return (
    <section className="fuel-calculator-section">
      <div className="calculator-heading">
        <div>
          <p className="eyebrow">ГОРИВО &amp; МОЯТА КОЛА</p>
          <h2>Сметката преди да тръгнеш.</h2>
          <p>Калкулирай разхода за маршрут, зареждане до пълен резервоар и ориентировъчния си месечен разход.</p>
        </div>
        <div className="calculator-fuel-chip">
          <span>{fuelLabelFor(fuel)}</span>
          <strong>{price > 0 ? money3.format(price) : "—"}</strong>
          <small>{averagePrice != null ? "текуща средна цена" : "няма средна цена"}</small>
        </div>
      </div>

      <div className="calculator-grid">
        <article className="panel car-profile">
          <div className="panel-title"><div><h3>МОЯТА КОЛА</h3><small className="nearby-meta">Запазва се на това устройство.</small></div></div>
          <div className="car-fields">
            <label><span>Модел / име</span><input type="text" value={car.name} maxLength={60} placeholder="Напр. Mazda 6 2.2D" onChange={(event) => updateCar("name", event.target.value)} /></label>
            <label><span>Резервоар</span><div className="calculator-input"><input type="number" min={20} max={150} step={1} value={car.tankCapacity} onChange={(event) => updateCar("tankCapacity", clamp(Number(event.target.value) || 20, 20, 150))} /><b>L</b></div></label>
            <label><span>Има сега</span><div className="calculator-input"><input type="number" min={0} max={car.tankCapacity} step={0.5} value={fuelInTank} onChange={(event) => updateCar("fuelInTank", clamp(Number(event.target.value) || 0, 0, car.tankCapacity))} /><b>L</b></div></label>
            <label><span>Километри / месец</span><div className="calculator-input"><input type="number" min={0} max={10000} step={50} value={car.monthlyKm} onChange={(event) => updateCar("monthlyKm", clamp(Number(event.target.value) || 0, 0, 10000))} /><b>km</b></div></label>
          </div>
          <div className="car-profile-note"><strong>{car.name || "Моята кола"}</strong><span>Разходът {consumption.toFixed(1)} L/100 km е този от настройките „Най-изгодно до теб“.</span></div>
        </article>

        <article className="panel trip-calculator">
          <div className="panel-title"><div><h3>МАРШРУТ</h3><small className="nearby-meta">Колко ще ти струва пътуването.</small></div></div>
          <div className="trip-top">
            <label><span>Разстояние</span><div className="calculator-input"><input type="number" min={0} max={5000} step={1} value={distance} onChange={(event) => setDistance(clamp(Number(event.target.value) || 0, 0, 5000))} /><b>km</b></div></label>
            <label className="trip-check"><span>Посока</span><button type="button" className={roundTrip ? "selected" : ""} onClick={() => setRoundTrip((value) => !value)} aria-pressed={roundTrip}>{roundTrip ? "Отиване + връщане" : "Само отиване"}</button></label>
          </div>
          <label className="price-field"><span>Цена за литър</span><div className="calculator-input calculator-price"><input type="number" min={0.5} max={5} step={0.001} value={price || ""} onChange={(event) => { setPriceTouched(true); setPrice(clamp(Number(event.target.value) || 0, 0, 5)); }} /><b>€/L</b></div></label>
          {cheapestNearby != null ? <button type="button" className="calculator-quick-price" onClick={() => { setPriceTouched(true); setPrice(cheapestNearby); }}>Използвай най-евтината наблизо: <strong>{money3.format(cheapestNearby)}</strong>{cheapestNearbyName ? " · " + cheapestNearbyName : ""}</button> : null}
          <div className="calculator-result-grid">
            <div><span>Гориво за маршрута</span><strong>{litersForTrip.toFixed(1)} L</strong></div>
            <div><span>Цена на маршрута</span><strong>{money.format(tripCost)}</strong></div>
            <div><span>До пълен резервоар</span><strong>{fillLiters.toFixed(1)} L</strong></div>
            <div><span>Зареждане до пълен</span><strong>{money.format(fillCost)}</strong></div>
          </div>
        </article>
      </div>

      <div className="calculator-bottom-grid">
        <article className="calculator-metric"><span>МЕСЕЧЕН РАЗХОД</span><strong>{money.format(monthlyCost)}</strong><small>{monthlyLiters.toFixed(0)} L при {car.monthlyKm.toFixed(0)} km / месец</small></article>
        <article className="calculator-metric"><span>РАЗХОД НА 100 KM</span><strong>{consumption.toFixed(1)} L</strong><small>{money.format(consumption * price)} за всеки 100 km</small></article>
        <article className="calculator-metric"><span>СПЕСТЯВАШ ОТ НАЙ-ЕВТИНОТО</span><strong>{savingsVsAverage != null ? money.format(savingsVsAverage) : "—"}</strong><small>{savingsVsAverage != null ? "при " + quantity + " L спрямо средната цена" : "нужни са средна и локална цена"}</small></article>
      </div>
      <p className="nearby-disclaimer">Калкулациите са ориентировъчни. Не включват трафик, наклон, стил на шофиране или реален маршрут; използват зададения разход и цена за литър.</p>
    </section>
  );
}
