import { allCollectors } from "@/lib/collectors";
import { ingest, ingestMarket } from "@/lib/ingest";
import type { Collector } from "@/lib/collectors/types";

async function runCollector(collector: Collector) {
  switch (collector.kind) {
    case "PRICE":
      return ingest(collector);
    case "MARKET":
      return ingestMarket(collector);
    case "NEWS":
      throw new Error(`News ingestion is not implemented yet for ${collector.name}`);
  }
}

async function main() {
  const collectors = allCollectors();

  if (!collectors.length) {
    console.info("No collectors configured. Nothing collected.");
    return;
  }

  console.table(
    collectors.map((collector) => ({
      name: collector.name,
      kind: collector.kind,
      baseUrl: collector.baseUrl,
    })),
  );

  const results = await Promise.allSettled(collectors.map(runCollector));

  console.table(
    results.map((result, index) =>
      result.status === "fulfilled"
        ? result.value
        : {
            source: collectors[index].name,
            type: collectors[index].kind,
            error: String(result.reason),
          },
    ),
  );

  if (results.some((result) => result.status === "rejected")) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
