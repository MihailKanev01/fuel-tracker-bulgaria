import { KaraiAdapter } from "./karai";
import { PublicCsvAdapter } from "./public-csv";
import type { Collector, MarketCollector, NewsCollector, PriceCollector } from "./types";

export function priceCollectors(): PriceCollector[] {
  const collectors: PriceCollector[] = [];
  const csvUrl = process.env.PUBLIC_PRICE_CSV_URL;

  if (csvUrl) collectors.push(new PublicCsvAdapter(csvUrl));
  return collectors;
}

export function marketCollectors(): MarketCollector[] {
  return [new KaraiAdapter()];
}

export function newsCollectors(): NewsCollector[] {
  return [];
}

export function allCollectors(): Collector[] {
  return [...priceCollectors(), ...marketCollectors(), ...newsCollectors()];
}

export function enabledAdapters(): PriceCollector[] {
  return priceCollectors();
}
