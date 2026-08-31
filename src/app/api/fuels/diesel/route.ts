import { NextResponse } from "next/server";
import { dieselOverview } from "@/lib/queries";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json(await dieselOverview(), { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } }); }
