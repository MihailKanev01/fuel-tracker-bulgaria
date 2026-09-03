import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function safeHost() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return null;
  try {
    return new URL(raw).hostname;
  } catch {
    return "INVALID_DATABASE_URL";
  }
}

export async function GET() {
  try {
    const groups = await prisma.price.groupBy({
      by: ["fuelType", "anomaly"],
      _count: { _all: true },
      orderBy: [{ fuelType: "asc" }, { anomaly: "asc" }],
    });

    return NextResponse.json({
      databaseHost: safeHost(),
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
