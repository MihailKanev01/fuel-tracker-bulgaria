"use client";

import { useCallback, useEffect, useState } from "react";
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

const USER_KEY_STORAGE = "fueltracker-alert-user-key-v1";

function readOrCreateUserKey() {
  try {
    const saved = window.localStorage.getItem(USER_KEY_STORAGE);
    if (saved && /^[0-9a-fA-F-]{36}$/.test(saved)) return saved;

    const next = typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : String(Date.now()) + "-" + Math.random().toString(16).slice(2);

    window.localStorage.setItem(USER_KEY_STORAGE, next);
    return next;
  } catch {
    return null;
  }
}

function fuelTypeFor(fuel: FuelKey): UserAlert["fuelType"] {
  const map: Record<FuelKey, UserAlert["fuelType"]> = {
    diesel: "DIESEL",
    a95: "GASOLINE_95",
    a100: "GASOLINE_100",
    lpg: "LPG",
    cng: "CNG",
  };
  return map[fuel];
}

async function apiRequest<T>(
  url: string,
  userKey: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  if (init?.body) headers.set("Content-Type", "application/json");
  headers.set("x-fueltracker-user-key", userKey);

  const response = await fetch(url, {
    ...init,
    headers,
    cache: "no-store",
  });

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : "Заявката за известията не успя.";

    throw new Error(message);
  }

  return data as T;
}

export function useAlerts() {
  const [userKey, setUserKey] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<UserAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setUserKey(readOrCreateUserKey());
  }, []);

  const refresh = useCallback(async () => {
    if (!userKey) return;

    try {
      setError(null);
      const next = await apiRequest<UserAlert[]>("/api/alerts", userKey);
      setAlerts(Array.isArray(next) ? next : []);
    } catch (err) {
      console.error("Alerts loading error:", err);
      setError(err instanceof Error ? err.message : "Неуспяхме да заредим известията.");
    } finally {
      setLoading(false);
    }
  }, [userKey]);

  useEffect(() => {
    if (!userKey) return;
    void refresh();

    const timer = window.setInterval(() => {
      void refresh();
    }, 5 * 60 * 1000);

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

    await apiRequest<UserAlert>("/api/alerts", userKey, {
      method: "POST",
      body: JSON.stringify({
        kind,
        fuelType: fuelTypeFor(fuel),
        threshold,
        stationId,
      }),
    });

    await refresh();
  }, [refresh, userKey]);

  const removeAlert = useCallback(async (id: string) => {
    if (!userKey) return;

    await apiRequest<{ ok: true }>(
      "/api/alerts/" + encodeURIComponent(id),
      userKey,
      { method: "DELETE" },
    );

    await refresh();
  }, [refresh, userKey]);

  return {
    alerts,
    loading,
    error,
    refresh,
    createAlert,
    removeAlert,
  };
}
