import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const groups = await prisma.price.groupBy({
      by: ["fuelType", "anomaly"],
      _count: { _all: true },
      orderBy: [{ fuelType: "asc" }, { anomaly: "asc" }],
    });

    return NextResponse.json({
      prices: groups.map((row) => ({
        fuelType: row.fuelType,
        anomaly: row.anomaly,
        count: row._count._all,
      })),
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("Debug database check failed:", error);
    return NextResponse.json(
      { error: "Database diagnostic failed" },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
