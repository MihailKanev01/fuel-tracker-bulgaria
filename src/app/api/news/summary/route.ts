import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function impactLabel(impact: string | null) {
  if (impact === "GOOD") return "GOOD";
  if (impact === "BAD") return "BAD";
  return "NEUTRAL";
}

export async function GET() {
  const [news, changes] = await Promise.all([
    prisma.newsItem.findMany({
      orderBy: { publishedAt: "desc" },
      take: 18,
      select: {
        id: true,
        title: true,
        url: true,
        publisher: true,
        publishedAt: true,
        summary: true,
        impact: true,
      },
    }),
    prisma.priceChange.findMany({
      where: { fuelType: "DIESEL" },
      orderBy: { detectedAt: "desc" },
      take: 10,
      include: { station: { select: { name: true, city: true } } },
    }),
  ]);

  const good = news.filter((item) => impactLabel(item.impact) === "GOOD");
  const bad = news.filter((item) => impactLabel(item.impact) === "BAD");
  const neutral = news.filter((item) => impactLabel(item.impact) === "NEUTRAL");
  const priceUp = changes.filter((item) => item.changeEur.toNumber() > 0);
  const priceDown = changes.filter((item) => item.changeEur.toNumber() < 0);

  return NextResponse.json({
    generatedAt: new Date(),
    headline:
      priceUp.length && !priceDown.length
        ? "Дизелът показва натиск нагоре."
        : priceDown.length && !priceUp.length
          ? "Дизелът показва натиск надолу."
          : news.length
            ? "Пазарът е смесен — следим новините и цените."
            : "Все още няма достатъчно пазарни новини.",
    good: good.slice(0, 5),
    bad: bad.slice(0, 5),
    neutral: neutral.slice(0, 5),
    priceUp: priceUp.slice(0, 5).map((item) => ({
      id: item.id,
      station: item.station.name,
      city: item.station.city,
      change: item.changeEur.toNumber(),
      percent: item.changePercent.toNumber(),
      detectedAt: item.detectedAt,
      sourceUrl: item.sourceUrl,
    })),
    priceDown: priceDown.slice(0, 5).map((item) => ({
      id: item.id,
      station: item.station.name,
      city: item.station.city,
      change: item.changeEur.toNumber(),
      percent: item.changePercent.toNumber(),
      detectedAt: item.detectedAt,
      sourceUrl: item.sourceUrl,
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}
