import type { IncomingPrice } from "@/lib/domain";
export type SourceAdapter = { name: string; kind: "API" | "OFFICIAL_SITE" | "STRUCTURED_ENDPOINT" | "HTML_PUBLIC"; baseUrl: string; collect(): Promise<IncomingPrice[]> };
