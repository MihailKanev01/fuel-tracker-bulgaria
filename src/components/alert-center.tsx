"use client";

import { useAlerts, type UserAlert } from "@/hooks/use-alerts";

const fmt = new Intl.NumberFormat("bg-BG", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 3,
});

function alertText(alert: UserAlert) {
  if (alert.kind === "PRICE_BELOW") {
    return "Под " + fmt.format(alert.threshold ?? 0) + "/л";
  }
  return "Промяна ≥ " + (alert.threshold ?? 0).toFixed(1) + "%";
}

export function AlertCenter() {
  const { alerts, loading, error, removeAlert } = useAlerts();
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
      </div>

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
                  <small>
                    {alert.stationCity ?? "България"} ·{" "}
                    {alert.fuelType === "DIESEL"
                      ? "Diesel"
                      : alert.fuelType === "GASOLINE_95"
                        ? "A95"
                        : alert.fuelType === "GASOLINE_100"
                          ? "A100"
                          : alert.fuelType}
                  </small>
                </div>
              </div>

              <div className="alert-rule">
                <strong>{alertText(alert)}</strong>
                <small>
                  {alert.lastTriggeredAt
                    ? "последно: " + new Date(alert.lastTriggeredAt).toLocaleString("bg-BG")
                    : "още не е задействано"}
                </small>
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
        Проверката е свързана с новите ценови наблюдения. Правилата се пазят за този браузър и се показват тук.
      </p>
    </section>
  );
}
