import type { NewsCollector, NewsObservation } from "./types";

const FEEDS = [
  {
    publisher: "Google News · Горива България",
    url: "https://news.google.com/rss/search?q=горива%20дизел%20цени%20България&hl=bg&gl=BG&ceid=BG:bg",
  },
  {
    publisher: "Google News · Петролен пазар",
    url: "https://news.google.com/rss/search?q=петрол%20Brent%20OPEC%20цени&hl=bg&gl=BG&ceid=BG:bg",
  },
  {
    publisher: "Google News · Геополитика и петрол",
    url: "https://news.google.com/rss/search?q=петрол%20Близък%20изток%20рафинерия%20санкции&hl=bg&gl=BG&ceid=BG:bg",
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

function parseFeed(xml: string, publisher: string): NewsObservation[] {
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];

  const parsed: Array<NewsObservation | null> = items.map((item) => {
    const title = tag(item, "title");
    const url = tag(item, "link");
    const pubDate = tag(item, "pubDate");
    const summary = tag(item, "description") ?? "";

    if (!title || !url || !pubDate) return null;
    const publishedAt = new Date(pubDate);
    if (!Number.isFinite(publishedAt.getTime())) return null;

    const observation: NewsObservation = {
      title,
      url,
      publisher,
      publishedAt,
      summary: summary.slice(0, 700) || undefined,
      impact: classify(title, summary),
    };

    return observation;
  });

  return parsed
    .filter((item): item is NewsObservation => item !== null)
    .slice(0, 12);
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

        all.push(...parseFeed(await response.text(), feed.publisher));
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
