import { NextResponse } from "next/server";
import { cheapestDiesel } from "@/lib/queries";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { const city = new URL(request.url).searchParams.get("city") ?? undefined; return NextResponse.json(await cheapestDiesel(100, city)); }
