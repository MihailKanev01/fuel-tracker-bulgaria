"use client";

import { useEffect, useState } from "react";
import { useAlerts, type UserAlert } from "@/hooks/use-alerts";

const fmt = new Intl.NumberFormat("bg-BG", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 3,
});

function alertText(alert: UserAlert) {
  if (alert.kind === "PRICE_BELOW") return "Под " + fmt.format(alert.threshold ?? 0) + "/л";
  return "Промяна ≥ " + (alert.threshold ?? 0).toFixed(1) + "%";
}

export function AlertCenter() {
  const {
    alerts,
    loading,
    error,
    removeAlert,
    requestBrowserNotifications,
  } = useAlerts();
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [permissionError, setPermissionError] = useState<string | null>(null);

  useEffect(() => {
    setPermission("Notification" in window ? Notification.permission : "unsupported");
  }, []);

  const active = alerts.filter((alert) => alert.active);

  return (
    <section className="alert-center panel" id="alerts">
      <div className="panel-title">
        <div>
          <h3>МОИТЕ ИЗВЕСТИЯ</h3>
          <small className="nearby-meta">
            {active.length ? active.length + " активни правила" : "Няма активни правила"}
          </small>
        </div>
        <div className="alert-header-actions">
          {permission !== "granted" && permission !== "unsupported" ? (
            <button
              type="button"
              onClick={async () => {
                setPermissionError(null);
                try {
                  await requestBrowserNotifications();
                  setPermission("granted");
                } catch (err) {
                  setPermissionError(err instanceof Error ? err.message : "Неуспяхме да активираме известията.");
                }
              }}
            >
              Разреши известия
            </button>
          ) : null}
        </div>
      </div>

      {permission === "granted" ? (
        <div className="alert-permission-ok">✓ Браузърските известия са разрешени.</div>
      ) : null}
      {permission === "unsupported" ? (
        <div className="alert-permission-note">Този браузър не поддържа системни известия. Правилата пак се следят.</div>
      ) : null}
      {permissionError ? <div className="empty alert-empty">{permissionError}</div> : null}
      {error ? <div className="empty alert-empty">{error}</div> : null}

      {loading ? (
        <div className="empty alert-empty">◌ Зареждаме известията…</div>
      ) : active.length ? (
        <div className="alert-list">
          {active.map((alert) => (
            <div key={alert.id} className="alert-row">
              <div className="alert-row-main">
                <span className="alert-icon">!</span>
                <div>
                  <strong>{alert.stationName ?? "Станция"}</strong>
                  <small>{alert.stationCity ?? "България"} · {alert.fuelType === "DIESEL" ? "Diesel" : alert.fuelType === "GASOLINE_95" ? "A95" : alert.fuelType === "GASOLINE_100" ? "A100" : alert.fuelType}</small>
                </div>
              </div>
              <div className="alert-rule">
                <strong>{alertText(alert)}</strong>
                {alert.lastTriggeredAt ? (
                  <small>последно: {new Date(alert.lastTriggeredAt).toLocaleString("bg-BG")}</small>
                ) : (
                  <small>още не е задействано</small>
                )}
              </div>
              <button
                type="button"
                className="alert-delete"
                onClick={() => void removeAlert(alert.id)}
                aria-label="Премахни известието"
                title="Премахни известието"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty alert-empty">
          <span>⌁</span>
          Добави известие от страницата на станция с натрупана история.
        </div>
      )}

      <p className="alert-note">
        Проверката е свързана с новите ценови наблюдения. Браузърното известие се показва, когато сайтът е отворен и има дадено разрешение.
      </p>
    </section>
  );
}
