import type { NewsCollector, NewsObservation } from "./types";

const FRESHNESS_MS = 7 * 24 * 60 * 60 * 1000;

const FEEDS = [
  {
    publisher: "Google News · Дизел",
    url: "https://news.google.com/rss/search?q=дизел%20горива%20цени%20България%20when%3A7d&hl=bg&gl=BG&ceid=BG:bg",
  },
  {
    publisher: "Google News · Бензин",
    url: "https://news.google.com/rss/search?q=бензин%20A95%20A100%20цени%20България%20when%3A7d&hl=bg&gl=BG&ceid=BG:bg",
  },
  {
    publisher: "Google News · LPG",
    url: "https://news.google.com/rss/search?q=LPG%20автогаз%20пропан%20бутан%20цени%20България%20when%3A7d&hl=bg&gl=BG&ceid=BG:bg",
  },
  {
    publisher: "Google News · CNG",
    url: "https://news.google.com/rss/search?q=CNG%20метан%20природен%20газ%20цени%20България%20when%3A7d&hl=bg&gl=BG&ceid=BG:bg",
  },
  {
    publisher: "Google News · Петролен пазар",
    url: "https://news.google.com/rss/search?q=петрол%20Brent%20OPEC%20цени%20when%3A7d&hl=bg&gl=BG&ceid=BG:bg",
  },
  {
    publisher: "Google News · Геополитика и петрол",
    url: "https://news.google.com/rss/search?q=петрол%20Близък%20изток%20рафинерия%20санкции%20when%3A7d&hl=bg&gl=BG&ceid=BG:bg",
  },
];

function decode(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(xml: string, name: string) {
  const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match?.[1] ? decode(match[1]) : null;
}

function classify(title: string, summary: string) {
  const text = `${title} ${summary}`.toLowerCase();
  const good = [
    "пада", "спад", "поевтин", "намал", "пониж", "дъмпинг", "предлагането расте",
    "производството расте", "запаси растат", "добивът расте", "ceasefire", "примирие",
    "oil prices fall", "crude falls", "production increase", "supply increase",
  ];
  const bad = [
    "поскъп", "ръст", "скок", "покач", "намаляване на добива", "спад на производството",
    "намалени запаси", "санкции", "атака", "война", "напрежение", "блокад", "прекъсване",
    "oil prices rise", "crude rises", "production cut", "supply disruption",
  ];
  const goodHits = good.filter((word) => text.includes(word)).length;
  const badHits = bad.filter((word) => text.includes(word)).length;
  if (goodHits > badHits) return "GOOD" as const;
  if (badHits > goodHits) return "BAD" as const;
  return "NEUTRAL" as const;
}

function parseFeed(xml: string, fallbackPublisher: string): NewsObservation[] {
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  const parsed: NewsObservation[] = [];
  const cutoff = Date.now() - FRESHNESS_MS;

  for (const item of items) {
    const title = tag(item, "title");
    const url = tag(item, "link");
    const pubDate = tag(item, "pubDate");
    const summary = tag(item, "description") ?? "";
    const source = tag(item, "source") ?? fallbackPublisher;

    if (!title || !url) continue;

    const publishedAt = pubDate ? new Date(pubDate) : new Date(NaN);
    if (!Number.isFinite(publishedAt.getTime())) continue;
    if (publishedAt.getTime() < cutoff || publishedAt.getTime() > Date.now() + 5 * 60 * 1000) continue;

    parsed.push({
      title,
      url,
      publisher: source,
      publishedAt,
      summary: summary.slice(0, 700) || undefined,
      impact: classify(title, summary),
    });
  }

  return parsed;
}

export class NewsAdapter implements NewsCollector {
  name = "Fuel News";
  kind = "NEWS" as const;
  sourceKind = "OFFICIAL_SITE" as const;
  baseUrl = "https://news.google.com/rss/";

  async collect(): Promise<NewsObservation[]> {
    const all: NewsObservation[] = [];

    for (const feed of FEEDS) {
      try {
        const response = await fetch(feed.url, {
          headers: {
            Accept: "application/rss+xml, application/xml, text/xml",
            "User-Agent": "FuelTrackerBG/1.0",
          },
          cache: "no-store",
          signal: AbortSignal.timeout(12_000),
        });

        if (!response.ok) {
          console.warn(`News feed failed ${response.status}: ${feed.url}`);
          continue;
        }

        const xml = await response.text();
        const parsed = parseFeed(xml, feed.publisher);
        console.log(`News feed ${feed.publisher}: ${parsed.length} fresh items parsed`);
        all.push(...parsed);
      } catch (error) {
        console.warn(`News feed error for ${feed.publisher}:`, String(error));
      }
    }

    const unique = new Map<string, NewsObservation>();
    for (const item of all) {
      if (!unique.has(item.url)) unique.set(item.url, item);
    }

    return [...unique.values()]
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, 30);
  }
}
