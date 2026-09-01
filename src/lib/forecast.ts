import { prisma } from "@/lib/prisma";

export type ForecastPoint = {
  date: string;
  low: number;
  expected: number;
  high: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
};

export type DieselForecast = {
  generatedAt: string;
  horizonDays: number;
  current: number | null;
  expectedEnd: number | null;
  expectedLow: number | null;
  expectedHigh: number | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  direction: "UP" | "DOWN" | "FLAT";
  explanation: string;
  factors: Array<{ label: string; direction: "UP" | "DOWN" | "NEUTRAL"; weight: number }>;
  points: ForecastPoint[];
};

const DAY = 86_400_000;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function mean(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function std(values: number[]) {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - m) ** 2)));
}

export async function dieselForecast(): Promise<DieselForecast> {
  const [historyRows, latestRows, newsRows, brent] = await Promise.all([
    prisma.price.findMany({
      where: { fuelType: "DIESEL", anomaly: false, observedAt: { gte: new Date(Date.now() - 30 * DAY) } },
      select: { priceEur: true, observedAt: true },
      orderBy: { observedAt: "asc" },
    }),
    prisma.price.findMany({
      where: { fuelType: "DIESEL", anomaly: false },
      select: { priceEur: true, observedAt: true },
      orderBy: { observedAt: "desc" },
      take: 500,
    }),
    prisma.newsItem.findMany({
      where: { publishedAt: { gte: new Date(Date.now() - 2 * DAY) } },
      select: { impact: true },
      orderBy: { publishedAt: "desc" },
      take: 30,
    }),
    fetch("https://query1.finance.yahoo.com/v8/finance/chart/BZ=F?range=14d&interval=1d", {
      headers: { Accept: "application/json", "User-Agent": "FuelTrackerBG/1.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    }).then(async (response) => {
      if (!response.ok) return null;
      const data = await response.json() as { chart?: { result?: Array<{ indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> } };
      const closes = data.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter((value): value is number => typeof value === "number") ?? [];
      if (closes.length < 3) return null;
      return { current: closes.at(-1)!, mean7: mean(closes.slice(-7)), mean14: mean(closes), trend7: closes.at(-1)! - mean(closes.slice(-4, -1)) };
    }).catch(() => null),
  ]);

  const grouped = new Map<string, number[]>();
  for (const row of historyRows) {
    const key = row.observedAt.toISOString().slice(0, 10);
    grouped.set(key, [...(grouped.get(key) ?? []), row.priceEur.toNumber()]);
  }

  const daily = [...grouped.entries()].map(([date, values]) => ({ date, value: mean(values) }));
  const currentValues = latestRows.map((row) => row.priceEur.toNumber()).filter(Number.isFinite);
  const current = currentValues.length ? mean(currentValues.slice(0, Math.min(currentValues.length, 150))) : null;

  if (current == null) {
    return {
      generatedAt: new Date().toISOString(),
      horizonDays: 7,
      current: null,
      expectedEnd: null,
      expectedLow: null,
      expectedHigh: null,
      confidence: "LOW",
      direction: "FLAT",
      explanation: "Няма достатъчно проверени данни за надеждна прогноза.",
      factors: [],
      points: [],
    };
  }

  const changes = daily.slice(1).map((row, index) => row.value - daily[index].value);
  const recentChanges = changes.slice(-14);
  const recentTrend = recentChanges.length ? clamp(mean(recentChanges), -0.012, 0.012) : 0;
  const volatility = Math.max(std(recentChanges), 0.0035);

  const goodNews = newsRows.filter((row) => row.impact === "GOOD").length;
  const badNews = newsRows.filter((row) => row.impact === "BAD").length;
  const newsNet = clamp((badNews - goodNews) / Math.max(newsRows.length, 1), -1, 1);

  let oilSignal = 0;
  if (brent) {
    const deviation = (brent.current - brent.mean7) / Math.max(brent.mean7, 1);
    oilSignal = clamp(deviation * 0.045 + (brent.trend7 / Math.max(brent.mean7, 1)) * 0.025, -0.004, 0.004);
  }

  const marketSignal = clamp(newsNet * 0.0018, -0.0018, 0.0018);
  const dailyDrift = clamp(recentTrend * 0.60 + oilSignal + marketSignal, -0.008, 0.008);
  const direction = dailyDrift > 0.00035 ? "UP" : dailyDrift < -0.00035 ? "DOWN" : "FLAT";

  const confidence: "HIGH" | "MEDIUM" | "LOW" = daily.length >= 14 && volatility < 0.008 ? "HIGH" : daily.length >= 7 ? "MEDIUM" : "LOW";
  const factors: DieselForecast["factors"] = [
    { label: "Местна ценова тенденция", direction: recentTrend > 0.00025 ? "UP" : recentTrend < -0.00025 ? "DOWN" : "NEUTRAL", weight: 50 },
    { label: "Brent", direction: oilSignal > 0.0003 ? "UP" : oilSignal < -0.0003 ? "DOWN" : "NEUTRAL", weight: 30 },
    { label: "Пазарни новини", direction: newsNet > 0.15 ? "UP" : newsNet < -0.15 ? "DOWN" : "NEUTRAL", weight: 20 },
  ];

  const points: ForecastPoint[] = [];
  for (let day = 0; day <= 7; day += 1) {
    const date = new Date(Date.now() + day * DAY).toISOString().slice(0, 10);
    const expected = current + dailyDrift * day;
    const spread = Math.max(0.006, volatility * 1.35 * Math.sqrt(Math.max(day, 1)));
    points.push({
      date,
      low: Math.max(0, expected - spread),
      expected,
      high: expected + spread,
      confidence: day <= 2 ? "HIGH" : day <= 5 ? "MEDIUM" : "LOW",
    });
  }

  const end = points.at(-1)!;
  const explanation = direction === "UP"
    ? "Базовият сценарий е за умерено поскъпване. Местната динамика е подкрепена от поскъпващ петрол или негативни пазарни новини."
    : direction === "DOWN"
      ? "Базовият сценарий е за умерено поевтиняване. Местната динамика е подкрепена от по-слаб петролен пазар или позитивни пазарни новини."
      : "Базовият сценарий е за относително стабилна цена. Наличните сигнали не дават достатъчно силна посока за голямо движение.";

  return {
    generatedAt: new Date().toISOString(),
    horizonDays: 7,
    current,
    expectedEnd: end.expected,
    expectedLow: Math.min(...points.map((point) => point.low)),
    expectedHigh: Math.max(...points.map((point) => point.high)),
    confidence,
    direction,
    explanation,
    factors,
    points,
  };
}
