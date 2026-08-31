import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) { const station = await prisma.station.findUnique({ where: { id: (await params).id }, include: { prices: { where: { anomaly: false }, include: { source: true }, orderBy: { observedAt: "desc" }, take: 25 }, changes: { orderBy: { detectedAt: "desc" }, take: 25 } } }); return station ? NextResponse.json(station) : NextResponse.json({ error: "Station not found" }, { status: 404 }); }
