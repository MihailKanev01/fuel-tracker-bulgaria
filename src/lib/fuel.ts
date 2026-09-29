export type FuelKey = "diesel" | "a95" | "a100" | "lpg" | "cng";

export const FUEL_OPTIONS: Array<{ key: FuelKey; label: string }> = [
  { key: "diesel", label: "Diesel" },
  { key: "a95", label: "A95" },
  { key: "a100", label: "A100" },
  { key: "lpg", label: "LPG" },
  { key: "cng", label: "CNG" },
];

export const fuelLabel = (key: FuelKey) =>
  FUEL_OPTIONS.find((option) => option.key === key)?.label ?? "Diesel";
