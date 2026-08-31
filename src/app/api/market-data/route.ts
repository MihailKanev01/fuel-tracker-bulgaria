import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { const metric = new URL(request.url).searchParams.get("metric"); return NextResponse.json(await prisma.marketDatum.findMany({ where: metric ? { metric } : undefined, orderBy: { observedAt: "desc" }, take: 365 })); }
