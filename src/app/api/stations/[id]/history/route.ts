import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) { const days = Math.min(365, Math.max(1, Number(new URL(request.url).searchParams.get("days") ?? 30))); const from = new Date(Date.now() - days * 86_400_000); const rows = await prisma.price.findMany({ where: { stationId: (await params).id, fuelType: "DIESEL", anomaly: false, observedAt: { gte: from } }, orderBy: { observedAt: "asc" } }); return NextResponse.json(rows); }
