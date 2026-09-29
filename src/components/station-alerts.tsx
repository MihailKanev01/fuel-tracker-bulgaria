"use client";

import { useMemo, useState } from "react";
import type { FuelKey } from "@/lib/fuel";
import { useAlerts } from "@/hooks/use-alerts";
import type { StationDetail } from "@/lib/station";

const fmt = new Intl.NumberFormat("bg-BG", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 3,
});

function fuelType(fuel: FuelKey) {
  return {
    diesel: "DIESEL",
    a95: "GASOLINE_95",
    a100: "GASOLINE_100",
    lpg: "LPG",
    cng: "CNG",
  }[fuel];
}

export function StationAlerts({ station, fuel }: { station: StationDetail; fuel: FuelKey }) {
  const { alerts, loading, createAlert, removeAlert } = useAlerts();
  const [kind, setKind] = useState<"PRICE_BELOW" | "PRICE_CHANGE">("PRICE_BELOW");
  const initialBelow = station.price != null
    ? Math.max(0.5, Math.min(3.5, Math.round((station.price - 0.05) * 1000) / 1000))
    : 1.5;
  const [threshold, setThreshold] = useState(initialBelow);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const active = useMemo(
    () => alerts.filter(
      (alert) =>
        alert.active &&
        alert.stationId === station.id &&
        alert.fuelType === fuelType(fuel),
    ),
    [alerts, fuel, station.id],
  );

  if (station.liveOnly) {
    return (
      <section className="station-alerts panel">
        <div className="panel-title">
          <div>
            <h3>ИЗВЕСТИЯ</h3>
            <small className="nearby-meta">За тази live станция още няма собствена история.</small>
          </div>
        </div>
        <p className="station-alert-disabled">
          Известията ще могат да се активират, когато станцията има ценови наблюдения в базата на Fuel Tracker.
        </p>
      </section>
    );
  }

  return (
    <section className="station-alerts panel">
      <div className="panel-title">
        <div>
          <h3>ИЗВЕСТИЯ ЗА {station.fuelLabel.toUpperCase()}</h3>
          <small className="nearby-meta">Правилата важат само за тази станция.</small>
        </div>
      </div>

      <div className="station-alert-form">
        <label>
          <span>Тип</span>
          <select
            value={kind}
            onChange={(event) => {
              const next = event.target.value as "PRICE_BELOW" | "PRICE_CHANGE";
              setKind(next);
              setThreshold(next === "PRICE_BELOW" ? initialBelow : 1);
              setMessage(null);
            }}
          >
            <option value="PRICE_BELOW">Когато цената падне под</option>
            <option value="PRICE_CHANGE">При промяна от поне</option>
          </select>
        </label>
        <label>
          <span>{kind === "PRICE_BELOW" ? "Праг" : "Промяна"}</span>
          <div className="station-alert-input">
            <input
              type="number"
              min={kind === "PRICE_BELOW" ? 0.5 : 0.1}
              max={kind === "PRICE_BELOW" ? 3.5 : 30}
              step={kind === "PRICE_BELOW" ? 0.001 : 0.1}
              value={threshold}
              onChange={(event) => setThreshold(Number(event.target.value))}
            />
            <b>{kind === "PRICE_BELOW" ? "€/L" : "%"}</b>
          </div>
        </label>
        <button
          type="button"
          className="station-alert-add"
          disabled={saving || loading}
          onClick={async () => {
            setMessage(null);
            setSaving(true);
            try {
              await createAlert({
                kind,
                fuel,
                threshold,
                stationId: station.id,
              });
              setMessage("Известието е запазено.");
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "Неуспяхме да запазим известието.");
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Запазваме…" : "Добави известие"}
        </button>
      </div>

      {message ? <div className="station-alert-message">{message}</div> : null}

      {active.length ? (
        <div className="station-alert-list">
          {active.map((alert) => (
            <div key={alert.id} className="station-alert-existing">
              <div>
                <strong>
                  {alert.kind === "PRICE_BELOW"
                    ? "Под " + fmt.format(alert.threshold ?? 0) + "/л"
                    : "Промяна ≥ " + (alert.threshold ?? 0).toFixed(1) + "%"}
                </strong>
                <small>
                  {alert.lastTriggeredAt
                    ? "Последно задействано: " + new Date(alert.lastTriggeredAt).toLocaleString("bg-BG")
                    : "Все още не е задействано"}
                </small>
              </div>
              <button type="button" onClick={() => void removeAlert(alert.id)}>Премахни</button>
            </div>
          ))}
        </div>
      ) : null}

      <p className="nearby-disclaimer">
        „Под цена“ се задейства при преминаване надолу през прага. „Промяна“ се задейства при всяка нова промяна, която достига зададения процент.
      </p>
    </section>
  );
}
