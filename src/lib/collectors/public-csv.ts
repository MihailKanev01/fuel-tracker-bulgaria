import { z } from "zod";
import type { SourceAdapter } from "./types";

const row = z.object({ name: z.string().min(1), address: z.string().min(1), city: z.string().min(1), fuel: z.enum(["DIESEL", "GASOLINE_95", "GASOLINE_100", "LPG", "CNG"]), price: z.coerce.number().positive(), currency: z.enum(["EUR", "BGN"]), observed_at: z.coerce.date(), url: z.string().url(), brand: z.string().optional(), region: z.string().optional(), latitude: z.coerce.number().optional(), longitude: z.coerce.number().optional() });

/** A deliberately generic adapter: enable only after confirming licence, robots.txt and rate limits. */
export class PublicCsvAdapter implements SourceAdapter {
  name = "Configured public CSV"; kind = "STRUCTURED_ENDPOINT" as const;
  constructor(public baseUrl: string) {}
  async collect() {
    const response = await fetch(this.baseUrl, { headers: { "User-Agent": "FuelTrackerBG/1.0 (contact: data@example.invalid)" }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`CSV source returned ${response.status}`);
    const [header, ...lines] = (await response.text()).trim().split(/\r?\n/);
    const columns = header.split(",").map((x) => x.trim());
    return lines.filter(Boolean).map((line) => Object.fromEntries(line.split(",").map((value, i) => [columns[i], value.trim()]))).map((value) => {
      const item = row.parse(value);
      return { station: { name: item.name, brand: item.brand, address: item.address, city: item.city, region: item.region, latitude: item.latitude, longitude: item.longitude }, fuel: item.fuel, amount: item.price, currency: item.currency, observedAt: item.observed_at, originalUrl: item.url };
    });
  }
}
