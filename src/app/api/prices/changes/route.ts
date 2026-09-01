import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { FuelType } from "@prisma/client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const aliases: Record<string, FuelType> = {
  diesel: "DIESEL",
  a95: "GASOLINE_95",
  a100: "GASOLINE_100",
  lpg: "LPG",
  cng: "CNG",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fuel = aliases[(searchParams.get("fuel") ?? "diesel").toLowerCase()];
  if (!fuel) return NextResponse.json({ error: "Unsupported fuel type" }, { status: 400 });

  const changes = await prisma.priceChange.findMany({
    where: { fuelType: fuel },
    include: { station: true },
    orderBy: { detectedAt: "desc" },
    take: 20,
  });

  return NextResponse.json(
    changes.map((change) => ({
      id: change.id,
      station: change.station.name,
      city: change.station.city,
      oldPrice: change.oldPriceEur.toNumber(),
      newPrice: change.newPriceEur.toNumber(),
      change: change.changeEur.toNumber(),
      percent: change.changePercent.toNumber(),
      detectedAt: change.detectedAt,
      sourceUrl: change.sourceUrl,
    })),
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
