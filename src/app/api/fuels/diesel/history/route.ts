import { NextResponse } from "next/server";
import { dieselHistory } from "@/lib/queries";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { const { searchParams } = new URL(request.url); const days = Math.min(365, Math.max(1, Number(searchParams.get("days") ?? 30))); return NextResponse.json(await dieselHistory(days, searchParams.get("city") ?? undefined)); }
