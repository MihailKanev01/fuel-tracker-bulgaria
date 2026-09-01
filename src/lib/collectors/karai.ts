import type { MarketCollector, MarketObservation } from "./types";

type KaraiProvider = {
  name?: string;
  diesel?: string | number | null;
  a95?: string | number | null;
  a100?: string | number | null;
  lpg?: string | number | null;
  methane?: string | number | null;
};

type KaraiResponse = {
  date?: string;
  origin?: string;
  source?: string;
  fetchedAt?: string;
  averages?: {
    diesel?: string | number | null;
    a95?: string | number | null;
    a100?: string | number | null;
    lpg?: string | number | null;
    methane?: string | number | null;
  };
  providers?: KaraiProvider[];
};

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export class KaraiAdapter implements MarketCollector {
  name = "KARAI";
  kind = "MARKET" as const;
  baseUrl = "https://karai.bg/api/fuel-prices";

  async collect(): Promise<MarketObservation[]> {
    const response = await fetch(this.baseUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "FuelTrackerBG/1.0",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`KARAI API returned ${response.status}`);
    }

    const data = (await response.json()) as KaraiResponse;
    const observedAt = data.fetchedAt ? new Date(data.fetchedAt) : new Date();

    if (Number.isNaN(observedAt.getTime())) {
      throw new Error("KARAI returned invalid fetchedAt");
    }

    const observations: MarketObservation[] = [];
    const averages = data.averages ?? {};

    const averageMetrics = [
      ["fuel.diesel.average", averages.diesel, "EUR/L"],
      ["fuel.a95.average", averages.a95, "EUR/L"],
      ["fuel.a100.average", averages.a100, "EUR/L"],
      ["fuel.lpg.average", averages.lpg, "EUR/L"],
      ["fuel.methane.average", averages.methane, "EUR/L"],
    ] as const;

    for (const [metric, rawValue, unit] of averageMetrics) {
      const value = toNumber(rawValue);
      if (value === null) continue;
      observations.push({ metric, value, unit, observedAt, sourceUrl: this.baseUrl });
    }

    for (const provider of data.providers ?? []) {
      if (!provider.name) continue;

      const providerMetrics = [
        ["diesel", provider.diesel],
        ["a95", provider.a95],
        ["a100", provider.a100],
        ["lpg", provider.lpg],
        ["methane", provider.methane],
      ] as const;

      for (const [fuel, rawValue] of providerMetrics) {
        const value = toNumber(rawValue);
        if (value === null) continue;
        observations.push({
          metric: `provider.${provider.name}.${fuel}`,
          value,
          unit: "EUR/L",
          observedAt,
          sourceUrl: this.baseUrl,
        });
      }
    }

    return observations;
  }
}
