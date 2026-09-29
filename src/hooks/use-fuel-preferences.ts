"use client";

import { useCallback, useEffect, useState } from "react";
import type { FuelKey } from "@/lib/fuel";

export type FavoriteStation = {
  id: string;
  name: string;
  brand: string | null;
  city: string;
  address: string;
  price: number;
  observedAt: string;
  confidence: number;
  sourceUrl: string;
  latitude: number | null;
  longitude: number | null;
};

const STORAGE_KEY = "fueltracker-preferences";
const DEFAULTS = {
  fuel: "diesel" as FuelKey,
  radius: 5,
  quantity: 50,
  consumption: 7,
  period: 30,
};

type StoredPreferences = Partial<typeof DEFAULTS> & {
  favorites?: FavoriteStation[];
};

function readPreferences(): StoredPreferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredPreferences;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function useFuelPreferences() {
  const [hydrated, setHydrated] = useState(false);
  const [fuel, setFuel] = useState<FuelKey>(DEFAULTS.fuel);
  const [radius, setRadiusState] = useState(DEFAULTS.radius);
  const [quantity, setQuantityState] = useState(DEFAULTS.quantity);
  const [consumption, setConsumptionState] = useState(DEFAULTS.consumption);
  const [period, setPeriodState] = useState(DEFAULTS.period);
  const [favorites, setFavorites] = useState<FavoriteStation[]>([]);

  useEffect(() => {
    const saved = readPreferences();

    const nextFuel =
      saved.fuel === "diesel" || saved.fuel === "a95" || saved.fuel === "a100" || saved.fuel === "lpg" || saved.fuel === "cng"
        ? saved.fuel
        : DEFAULTS.fuel;

    setFuel(nextFuel);
    setRadiusState(
      typeof saved.radius === "number" && [5, 10, 25, 50].includes(saved.radius)
        ? saved.radius
        : DEFAULTS.radius,
    );
    setQuantityState(
      typeof saved.quantity === "number"
        ? Math.min(120, Math.max(5, saved.quantity))
        : DEFAULTS.quantity,
    );
    setConsumptionState(
      typeof saved.consumption === "number"
        ? Math.min(30, Math.max(3, saved.consumption))
        : DEFAULTS.consumption,
    );
    setPeriodState(
      typeof saved.period === "number" && [1, 7, 30, 90, 365].includes(saved.period)
        ? saved.period
        : DEFAULTS.period,
    );
    setFavorites(Array.isArray(saved.favorites) ? saved.favorites.slice(0, 30) : []);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    const payload: StoredPreferences = {
      fuel,
      radius,
      quantity,
      consumption,
      period,
      favorites,
    };

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Preferences are optional; quota/private-mode failures must not affect the app.
    }
  }, [hydrated, fuel, radius, quantity, consumption, period, favorites]);

  const setRadius = useCallback((value: number) => {
    if ([5, 10, 25, 50].includes(value)) setRadiusState(value);
  }, []);

  const setQuantity = useCallback((value: number) => {
    setQuantityState(Math.min(120, Math.max(5, value)));
  }, []);

  const setConsumption = useCallback((value: number) => {
    setConsumptionState(Math.min(30, Math.max(3, value)));
  }, []);

  const setPeriod = useCallback((value: number) => {
    if ([1, 7, 30, 90, 365].includes(value)) setPeriodState(value);
  }, []);

  const toggleFavorite = useCallback((station: FavoriteStation) => {
    setFavorites((current) => {
      const exists = current.some((item) => item.id === station.id);
      return exists
        ? current.filter((item) => item.id !== station.id)
        : [station, ...current].slice(0, 30);
    });
  }, []);

  const updateFavoriteFromLive = useCallback((station: FavoriteStation) => {
    setFavorites((current) => {
      if (!current.some((item) => item.id === station.id)) return current;
      return current.map((item) => item.id === station.id ? station : item);
    });
  }, []);

  return {
    hydrated,
    fuel,
    setFuel,
    radius,
    setRadius,
    quantity,
    setQuantity,
    consumption,
    setConsumption,
    period,
    setPeriod,
    favorites,
    toggleFavorite,
    updateFavoriteFromLive,
  };
}
