import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export async function GET() {
  const changes = await prisma.priceChange.findMany({ where: { fuelType: "DIESEL" }, include: { station: true }, orderBy: { detectedAt: "desc" }, take: 20 });
  return NextResponse.json(changes.map((change) => ({ id: change.id, station: change.station.name, city: change.station.city, oldPrice: change.oldPriceEur.toNumber(), newPrice: change.newPriceEur.toNumber(), change: change.changeEur.toNumber(), percent: change.changePercent.toNumber(), detectedAt: change.detectedAt, sourceUrl: change.sourceUrl })));
}
