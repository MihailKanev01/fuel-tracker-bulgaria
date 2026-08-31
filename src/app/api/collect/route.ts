import { NextResponse } from "next/server";
import { enabledAdapters } from "@/lib/collectors";
import { ingest } from "@/lib/ingest";
export async function POST(request: Request) {
  if (!process.env.COLLECTOR_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.COLLECTOR_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const results = await Promise.allSettled(enabledAdapters().map(ingest));
  return NextResponse.json(results.map((r) => r.status === "fulfilled" ? r.value : { error: String(r.reason) }), { status: 207 });
}
