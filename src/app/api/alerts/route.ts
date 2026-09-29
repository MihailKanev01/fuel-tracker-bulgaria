import { NextResponse } from "next/server";
import { listUserAlerts } from "@/lib/alerts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const userKey = request.headers.get("x-fueltracker-user-key");
  try {
    const alerts = await listUserAlerts(userKey);
    return NextResponse.json(alerts, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("Alerts GET error:", error);
    return NextResponse.json({ error: "Неуспяхме да заредим известията." }, { status: 500 });
  }
}
