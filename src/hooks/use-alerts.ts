"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FuelKey } from "@/lib/fuel";

export type AlertKind = "PRICE_BELOW" | "PRICE_CHANGE";

export type UserAlert = {
  id: string;
  kind: AlertKind;
  fuelType: "DIESEL" | "GASOLINE_95" | "GASOLINE_100" | "LPG" | "CNG";
  threshold: number | null;
  stationId: string | null;
  stationName: string | null;
  stationCity: string | null;
  active: boolean;
  createdAt: string;
  lastTriggeredAt: string | null;
  lastTriggeredPrice: number | null;
};

const USER_KEY = "fueltracker-alert-user-key-v1";
const LAST_SEEN = "fueltracker-alert-last-seen-v1";

function validUserKey(value: string | null) {
  return Boolean(value && /^[0-9a-fA-F-]{36}$/.test(value));
}

function fuelToType(fuel: FuelKey): UserAlert["fuelType"] {
  return {
    diesel: "DIESEL",
    a95: "GASOLINE_95",
    a100: "GASOLINE_100",
    lpg: "LPG",
    cng: "CNG",
  }[fuel];
}

function getOrCreateUserKey() {
  try {
    const saved = window.localStorage.getItem(USER_KEY);
    if (validUserKey(saved)) return saved!;
    const next = window.crypto?.randomUUID?.() ?? String(Date.now()) + "-" + Math.random().toString(16).slice(2);
    window.localStorage.setItem(USER_KEY, next);
    return next;
  } catch {
    return null;
  }
}

async function request<T>(url: string, init?: RequestInit, userKey?: string | null): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  if (init?.body) headers.set("Content-Type", "application/json");
  if (userKey) headers.set("x-fueltracker-user-key", userKey);

  const response = await fetch(url, {
    ...init,
    headers,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : "Request failed with status " + response.status;
    throw new Error(message);
  }
  return payload as T;
}

export function useAlerts() {
  const [userKey, setUserKey] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<UserAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    setUserKey(getOrCreateUserKey());
  }, []);

  const refresh = useCallback(async () => {
    if (!userKey) return;

    try {
      setError(null);
      const next = await request<UserAlert[]>("/api/alerts", undefined, userKey);
      setAlerts(Array.isArray(next) ? next : []);

      const triggered = next.filter((alert) => alert.lastTriggeredAt);
      const newest = triggered
        .map((alert) => new Date(alert.lastTriggeredAt!).getTime())
        .filter(Number.isFinite)
        .sort((a, b) => b - a)[0] ?? 0;

      let lastSeen = 0;
      try {
        lastSeen = Number(window.localStorage.getItem(LAST_SEEN) ?? 0);
      } catch {}

      if (initializedRef.current && newest > lastSeen) {
        const fresh = triggered.filter((alert) => new Date(alert.lastTriggeredAt!).getTime() > lastSeen);
        if ("Notification" in window && Notification.permission === "granted") {
          for (const alert of fresh.slice(0, 3)) {
            const station = alert.stationName ?? "твоя станция";
            const message = alert.kind === "PRICE_BELOW"
              ? station + ": " + (alert.lastTriggeredPrice?.toFixed(3) ?? "—") + " €/л"
              : station + ": нова промяна на цената";
            new Notification("Fuel Tracker BG", { body: message, tag: "fueltracker-" + alert.id });
          }
        }
        try {
          window.localStorage.setItem(LAST_SEEN, String(newest));
        } catch {}
      } else if (!initializedRef.current && newest > lastSeen) {
        try {
          window.localStorage.setItem(LAST_SEEN, String(newest));
        } catch {}
      }

      initializedRef.current = true;
    } catch (err) {
      console.error("Alerts loading error:", err);
      setError("Неуспяхме да заредим известията.");
    } finally {
      setLoading(false);
    }
  }, [userKey]);

  useEffect(() => {
    if (!userKey) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [refresh, userKey]);

  const createAlert = useCallback(async ({
    kind,
    fuel,
    threshold,
    stationId,
  }: {
    kind: AlertKind;
    fuel: FuelKey;
    threshold: number;
    stationId: string;
  }) => {
    if (!userKey) throw new Error("Потребителският ключ още не е готов.");

    await request<UserAlert>("/api/alerts", {
      method: "POST",
      body: JSON.stringify({
        kind,
        fuelType: fuelToType(fuel),
        threshold,
        stationId,
      }),
    }, userKey);
    await refresh();
  }, [refresh, userKey]);

  const removeAlert = useCallback(async (id: string) => {
    if (!userKey) return;
    await request<{ ok: true }>(
      "/api/alerts/" + encodeURIComponent(id),
      { method: "DELETE" },
      userKey,
    );
    await refresh();
  }, [refresh, userKey]);

  const requestBrowserNotifications = useCallback(async () => {
    if (!("Notification" in window)) throw new Error("Този браузър не поддържа известия.");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Разрешението за браузърски известия не е дадено.");
  }, []);

  return {
    userKey,
    alerts,
    loading,
    error,
    refresh,
    createAlert,
    removeAlert,
    requestBrowserNotifications,
  };
}
