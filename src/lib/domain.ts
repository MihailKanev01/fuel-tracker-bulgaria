export const BGN_PER_EUR = 1.95583;
export const EUR_PRICE_RANGE = { min: 0.5, max: 3.5 };

export type IncomingPrice = {
  station: { name: string; brand?: string; address: string; city: string; region?: string; latitude?: number; longitude?: number };
  fuel: "DIESEL" | "GASOLINE_95" | "GASOLINE_100" | "LPG" | "CNG";
  amount: number; currency: "EUR" | "BGN"; observedAt: Date; originalUrl: string;
};

export function toEur(amount: number, currency: IncomingPrice["currency"]) { return currency === "BGN" ? amount / BGN_PER_EUR : amount; }
export function validatePrice(amountEur: number) {
  if (!Number.isFinite(amountEur)) return "Невалидна числова стойност";
  if (amountEur < EUR_PRICE_RANGE.min || amountEur > EUR_PRICE_RANGE.max) return "Извън допустимия диапазон";
  return null;
}
