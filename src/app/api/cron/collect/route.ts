import { NextResponse } from "next/server";
import { allCollectors } from "@/lib/collectors";
import { ingest, ingestMarket, ingestNews } from "@/lib/ingest";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const configured = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (configured && authorization !== `Bearer ${configured}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const collectors = allCollectors();
  const results = await Promise.allSettled(
    collectors.map((collector) => {
      switch (collector.kind) {
        case "PRICE":
          return ingest(collector);
        case "MARKET":
          return ingestMarket(collector);
        case "NEWS":
          return ingestNews(collector);
      }
    }),
  );

  const response = results.map((result, index) =>
    result.status === "fulfilled"
      ? result.value
      : { source: collectors[index].name, type: collectors[index].kind, error: String(result.reason) },
  );

  return NextResponse.json(response, { status: results.some((result) => result.status === "rejected") ? 207 : 200 });
}
