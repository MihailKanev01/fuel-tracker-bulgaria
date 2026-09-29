import { NextResponse } from "next/server";
import { createUserAlert, removeUserAlert } from "@/lib/alerts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  const userKey = request.headers.get("x-fueltracker-user-key");
  const body = (await request.json().catch(() => null)) as {
    kind?: string;
    fuelType?: string;
    threshold?: number;
    stationId?: string;
  } | null;

  try {
    const alert = await createUserAlert({
      userKey,
      kind: body?.kind ?? null,
      fuelType: body?.fuelType ?? null,
      threshold: body?.threshold,
      stationId: body?.stationId ?? null,
    });
    return NextResponse.json(alert, { status: 201, headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Неуспяхме да създадем известието.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const userKey = request.headers.get("x-fueltracker-user-key");
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  try {
    const removed = await removeUserAlert(userKey, id ?? "");
    if (!removed) return NextResponse.json({ error: "Известието не е намерено." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Alerts DELETE error:", error);
    return NextResponse.json({ error: "Неуспяхме да премахнем известието." }, { status: 500 });
  }
}
