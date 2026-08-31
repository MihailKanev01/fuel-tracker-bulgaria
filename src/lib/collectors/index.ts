import { PublicCsvAdapter } from "./public-csv";
import type { SourceAdapter } from "./types";

export function enabledAdapters(): SourceAdapter[] {
  const url = process.env.PUBLIC_PRICE_CSV_URL;
  return url ? [new PublicCsvAdapter(url)] : [];
}
