import type { IncomingPrice } from "@/lib/domain";

export type CollectorKind = "PRICE" | "MARKET" | "NEWS";
export type SourceKind = "API" | "OFFICIAL_SITE" | "STRUCTURED_ENDPOINT" | "HTML_PUBLIC";

export type BaseCollector = {
  name: string;
  kind: CollectorKind;
  sourceKind: SourceKind;
  baseUrl: string;
};

export type PriceCollector = BaseCollector & {
  kind: "PRICE";
  collect(): Promise<IncomingPrice[]>;
};

export type MarketObservation = {
  metric: string;
  value: number;
  unit: string;
  observedAt: Date;
  sourceUrl: string;
};

export type MarketCollector = BaseCollector & {
  kind: "MARKET";
  collect(): Promise<MarketObservation[]>;
};

export type NewsObservation = {
  title: string;
  url: string;
  publisher: string;
  publishedAt: Date;
  summary?: string;
  impact?: "GOOD" | "BAD" | "NEUTRAL";
};

export type NewsCollector = BaseCollector & {
  kind: "NEWS";
  collect(): Promise<NewsObservation[]>;
};

export type Collector = PriceCollector | MarketCollector | NewsCollector;
export type SourceAdapter = PriceCollector;
