import { NextResponse } from "next/server";
import { dieselForecast } from "@/lib/forecast";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    return NextResponse.json(await dieselForecast());
  } catch (error) {
    console.error("Diesel forecast error:", error);
    return NextResponse.json({ error: "Неуспяхме да изчислим прогнозата." }, { status: 500 });
  }
}
