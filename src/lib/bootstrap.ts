import { prisma } from "@/lib/prisma";
import { priceCollectors, marketCollectors } from "@/lib/collectors";
import { ingest, ingestMarket } from "@/lib/ingest";

let bootstrapPromise: Promise<void> | null = null;

const recent = (value: Date | null | undefined, minutes = 30) =>
  Boolean(value && Date.now() - value.getTime() < minutes * 60_000);

export async function ensureInitialData() {
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    const [priceSource, marketSource, priceCount, marketCount] = await Promise.all([
      prisma.source.findUnique({ where: { name: "Fuelo" }, select: { lastSuccessAt: true } }),
      prisma.source.findUnique({ where: { name: "KARAI" }, select: { lastSuccessAt: true } }),
      prisma.price.count({ where: { anomaly: false } }),
      prisma.marketDatum.count(),
    ]);

    const needsPriceSeed = priceCount === 0 && !recent(priceSource?.lastSuccessAt);
    const needsMarketSeed = marketCount === 0 && !recent(marketSource?.lastSuccessAt);

    if (!needsPriceSeed && !needsMarketSeed) return;

    const tasks: Promise<unknown>[] = [];
    if (needsPriceSeed) {
      for (const collector of priceCollectors()) tasks.push(ingest(collector));
    }
    if (needsMarketSeed) {
      for (const collector of marketCollectors()) tasks.push(ingestMarket(collector));
    }

    await Promise.allSettled(tasks);
  })().finally(() => {
    bootstrapPromise = null;
  });

  return bootstrapPromise;
}
