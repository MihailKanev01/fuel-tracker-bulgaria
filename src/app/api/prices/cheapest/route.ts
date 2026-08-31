import { NextResponse } from "next/server";
import { cheapestDiesel } from "@/lib/queries";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { const { searchParams } = new URL(request.url); return NextResponse.json(await cheapestDiesel(Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 10))), searchParams.get("city") ?? undefined)); }
