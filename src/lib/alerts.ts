import { Prisma, FuelType, AlertKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type UserAlert = {
  id: string;
  kind: AlertKind;
  fuelType: FuelType;
  threshold: number | null;
  stationId: string | null;
  stationName: string | null;
  stationCity: string | null;
  active: boolean;
  createdAt: string;
  lastTriggeredAt: string | null;
  lastTriggeredPrice: number | null;
};

function cleanUserKey(value: string | null) {
  if (!value) return null;
  const key = value.trim();
  return /^[0-9a-fA-F-]{36}$/.test(key) ? key : null;
}

function cleanThreshold(kind: AlertKind, value: unknown) {
  const threshold = Number(value);
  if (!Number.isFinite(threshold)) return null;

  if (kind === "PRICE_BELOW") {
    return threshold >= 0.5 && threshold <= 3.5 ? threshold : null;
  }

  if (kind === "PRICE_CHANGE") {
    return threshold >= 0.1 && threshold <= 30 ? threshold : null;
  }

  return null;
}

export function validateAlertInput(input: {
  userKey: string | null;
  kind: string | null;
  fuelType: string | null;
  threshold: unknown;
  stationId: string | null;
}) {
  const userKey = cleanUserKey(input.userKey);
  if (!userKey) return { error: "Невалиден потребителски ключ." } as const;

  const kind = input.kind === "PRICE_BELOW" || input.kind === "PRICE_CHANGE"
    ? input.kind
    : null;
  if (!kind) return { error: "Невалиден тип известие." } as const;

  const fuelType = input.fuelType &&
    ["DIESEL", "GASOLINE_95", "GASOLINE_100", "LPG", "CNG"].includes(input.fuelType)
    ? input.fuelType as FuelType
    : null;
  if (!fuelType) return { error: "Невалидно гориво." } as const;

  if (!input.stationId || input.stationId.length > 128 || input.stationId.startsWith("fuelo-")) {
    return { error: "Известията са налични за станции с натрупана история." } as const;
  }

  const threshold = cleanThreshold(kind, input.threshold);
  if (threshold == null) return { error: "Прагът е извън допустимия диапазон." } as const;

  return { userKey, kind, fuelType, stationId: input.stationId, threshold } as const;
}

export async function listUserAlerts(userKey: string | null) {
  const key = cleanUserKey(userKey);
  if (!key) return [];

  const alerts = await prisma.alert.findMany({
    where: { userKey: key },
    orderBy: { createdAt: "desc" },
  });

  const stationIds = [...new Set(alerts.map((alert) => alert.stationId).filter((id): id is string => Boolean(id)))];
  const stations = stationIds.length
    ? await prisma.station.findMany({
        where: { id: { in: stationIds } },
        select: { id: true, name: true, brand: true, city: true },
      })
    : [];
  const stationMap = new Map(stations.map((station) => [station.id, station]));

  return alerts.map((alert) => {
    const station = alert.stationId ? stationMap.get(alert.stationId) : undefined;
    return {
      id: alert.id,
      kind: alert.kind,
      fuelType: alert.fuelType,
      threshold: alert.threshold?.toNumber() ?? null,
      stationId: alert.stationId,
      stationName: station?.brand ?? station?.name ?? null,
      stationCity: station?.city ?? null,
      active: alert.active,
      createdAt: alert.createdAt.toISOString(),
      lastTriggeredAt: alert.lastTriggeredAt?.toISOString() ?? null,
      lastTriggeredPrice: alert.lastTriggeredPrice?.toNumber() ?? null,
    } satisfies UserAlert;
  });
}

export async function createUserAlert(input: {
  userKey: string | null;
  kind: string | null;
  fuelType: string | null;
  threshold: unknown;
  stationId: string | null;
}) {
  const validated = validateAlertInput(input);
  if ("error" in validated) throw new Error(validated.error);

  const station = await prisma.station.findUnique({
    where: { id: validated.stationId },
    select: { id: true },
  });
  if (!station) throw new Error("Станцията не е намерена или още няма натрупана история.");

  const existing = await prisma.alert.findFirst({
    where: {
      userKey: validated.userKey,
      kind: validated.kind,
      fuelType: validated.fuelType,
      stationId: validated.stationId,
      active: true,
    },
  });
  if (existing) {
    return listUserAlerts(validated.userKey).then((alerts) => alerts.find((alert) => alert.id === existing.id) ?? null);
  }

  const created = await prisma.alert.create({
    data: {
      userKey: validated.userKey,
      kind: validated.kind,
      fuelType: validated.fuelType,
      threshold: new Prisma.Decimal(validated.threshold),
      stationId: validated.stationId,
    },
  });

  const alerts = await listUserAlerts(validated.userKey);
  return alerts.find((alert) => alert.id === created.id) ?? null;
}

export async function removeUserAlert(userKey: string | null, id: string) {
  const key = cleanUserKey(userKey);
  if (!key || !id) return false;

  const result = await prisma.alert.updateMany({
    where: { id, userKey: key },
    data: { active: false },
  });
  return result.count > 0;
}

export async function evaluatePriceAlerts(stationId: string, fuelType: FuelType, previousPrice: number | null, newPrice: number) {
  const alerts = await prisma.alert.findMany({
    where: { stationId, fuelType, active: true },
  });
  if (!alerts.length) return 0;

  let triggered = 0;

  for (const alert of alerts) {
    const threshold = alert.threshold?.toNumber();
    if (threshold == null) continue;

    let shouldTrigger = false;

    if (alert.kind === "PRICE_BELOW") {
      shouldTrigger = newPrice <= threshold && (previousPrice == null || previousPrice > threshold);
    } else if (alert.kind === "PRICE_CHANGE") {
      if (previousPrice != null && previousPrice > 0) {
        const percent = Math.abs((newPrice - previousPrice) / previousPrice) * 100;
        shouldTrigger = percent >= threshold;
      }
    }

    if (!shouldTrigger) continue;

    await prisma.alert.update({
      where: { id: alert.id },
      data: {
        lastTriggeredAt: new Date(),
        lastTriggeredPrice: new Prisma.Decimal(newPrice),
      },
    });
    triggered++;
  }

  return triggered;
}
