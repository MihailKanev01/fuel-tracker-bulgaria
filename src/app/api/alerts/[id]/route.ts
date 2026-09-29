import { NextResponse } from "next/server";
import { removeUserAlert } from "@/lib/alerts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userKey = request.headers.get("x-fueltracker-user-key");
  const { id } = await context.params;

  try {
    const removed = await removeUserAlert(userKey, id);
    if (!removed) {
      return NextResponse.json({ error: "Известието не е намерено." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Alerts DELETE error:", error);
    return NextResponse.json({ error: "Неуспяхме да премахнем известието." }, { status: 500 });
  }
}
