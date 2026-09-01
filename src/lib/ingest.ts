import { Prisma, SourceKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toEur, validatePrice, type IncomingPrice } from "@/lib/domain";
import type { MarketCollector, MarketObservation, PriceCollector } from "@/lib/collectors/types";

export async function ingest(adapter: PriceCollector) {
  const source = await prisma.source.upsert({
    where: { name: adapter.name },
    update: { baseUrl: adapter.baseUrl, kind: adapter.sourceKind as SourceKind, lastAttemptAt: new Date() },
    create: {
      name: adapter.name,
      baseUrl: adapter.baseUrl,
      kind: adapter.sourceKind as SourceKind,
      status: "ONLINE",
      lastAttemptAt: new Date(),
    },
  });
  const run = await prisma.fetchRun.create({ data: { sourceId: source.id } });

  try {
    const records = await adapter.collect();
    let accepted = 0;
    let rejected = 0;

    for (const item of records) {
      (await writePrice(item, source.id)) ? accepted++ : rejected++;
    }

    await prisma.$transaction([
      prisma.fetchRun.update({
        where: { id: run.id },
        data: { completedAt: new Date(), recordsFetched: records.length, accepted, rejected },
      }),
      prisma.source.update({
        where: { id: source.id },
        data: {
          status: "ONLINE",
          lastSuccessAt: new Date(),
          recordsSeen: { increment: records.length },
          errorMessage: null,
        },
      }),
    ]);

    return { source: adapter.name, type: "price", accepted, rejected };
  } catch (error) {
    await prisma.$transaction([
      prisma.fetchRun.update({
        where: { id: run.id },
        data: { completedAt: new Date(), errorMessage: String(error) },
      }),
      prisma.source.update({
        where: { id: source.id },
        data: { status: "ERROR", errorMessage: String(error) },
      }),
    ]);
    throw error;
  }
}

export async function ingestMarket(adapter: MarketCollector) {
  const source = await prisma.source.upsert({
    where: { name: adapter.name },
    update: { baseUrl: adapter.baseUrl, kind: adapter.sourceKind as SourceKind, lastAttemptAt: new Date() },
    create: {
      name: adapter.name,
      baseUrl: adapter.baseUrl,
      kind: adapter.sourceKind as SourceKind,
      status: "ONLINE",
      lastAttemptAt: new Date(),
    },
  });

  const run = await prisma.fetchRun.create({ data: { sourceId: source.id } });

  try {
    const records = await adapter.collect();
    let accepted = 0;

    for (const item of records) {
      if (await writeMarketObservation(item)) accepted++;
    }

    await prisma.$transaction([
      prisma.fetchRun.update({
        where: { id: run.id },
        data: { completedAt: new Date(), recordsFetched: records.length, accepted, rejected: records.length - accepted },
      }),
      prisma.source.update({
        where: { id: source.id },
        data: {
          status: "ONLINE",
          lastSuccessAt: new Date(),
          recordsSeen: { increment: accepted },
          errorMessage: null,
        },
      }),
    ]);

    return { source: adapter.name, type: "market", accepted, rejected: records.length - accepted };
  } catch (error) {
    await prisma.$transaction([
      prisma.fetchRun.update({
        where: { id: run.id },
        data: { completedAt: new Date(), errorMessage: String(error) },
      }),
      prisma.source.update({
        where: { id: source.id },
        data: { status: "ERROR", errorMessage: String(error) },
      }),
    ]);
    throw error;
  }
}

async function writeMarketObservation(item: MarketObservation) {
  if (!Number.isFinite(item.value)) return false;
  if (!Number.isFinite(item.observedAt.getTime())) return false;
  if (!item.metric || !item.unit || !item.sourceUrl) return false;

  await prisma.marketDatum.upsert({
    where: {
      metric_observedAt: {
        metric: item.metric,
        observedAt: item.observedAt,
      },
    },
    update: {
      value: new Prisma.Decimal(item.value),
      unit: item.unit,
      sourceUrl: item.sourceUrl,
    },
    create: {
      metric: item.metric,
      value: new Prisma.Decimal(item.value),
      unit: item.unit,
      observedAt: item.observedAt,
      sourceUrl: item.sourceUrl,
    },
  });

  return true;
}

async function writePrice(item: IncomingPrice, sourceId: string) {
  const priceEur = toEur(item.amount, item.currency);
  const validationError = validatePrice(priceEur);
  if (validationError) return false;

  const station = await prisma.station.upsert({
    where: {
      name_address_city: {
        name: item.station.name,
        address: item.station.address,
        city: item.station.city,
      },
    },
    update: {
      brand: item.station.brand,
      region: item.station.region,
      latitude: item.station.latitude,
      longitude: item.station.longitude,
    },
    create: item.station,
  });

  const previous = await prisma.price.findFirst({
    where: { stationId: station.id, fuelType: item.fuel, anomaly: false },
    orderBy: { observedAt: "desc" },
  });

  const price = await prisma.price.create({
    data: {
      stationId: station.id,
      sourceId,
      fuelType: item.fuel,
      priceEur: new Prisma.Decimal(priceEur),
      observedAt: item.observedAt,
      originalPrice: new Prisma.Decimal(item.amount),
      originalCurrency: item.currency,
      originalUrl: item.originalUrl,
      confidence: previous ? 85 : 70,
    },
  });

  if (previous && !previous.priceEur.equals(price.priceEur)) {
    const old = previous.priceEur.toNumber();
    const change = priceEur - old;

    await prisma.priceChange.create({
      data: {
        stationId: station.id,
        fuelType: item.fuel,
        oldPriceEur: previous.priceEur,
        newPriceEur: price.priceEur,
        changeEur: new Prisma.Decimal(change),
        changePercent: new Prisma.Decimal((change / old) * 100),
        sourceUrl: item.originalUrl,
      },
    });
  }

  return true;
}
