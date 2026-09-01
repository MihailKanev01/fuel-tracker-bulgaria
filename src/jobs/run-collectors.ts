import { enabledAdapters } from "@/lib/collectors";
import { ingest } from "@/lib/ingest";

async function main() {
  const adapters = enabledAdapters();

  if (!adapters.length) {
    console.info("No authorised public data source configured. Nothing collected.");
    return;
  }

  const results = await Promise.allSettled(adapters.map(ingest));
  console.table(
    results.map((result) =>
      result.status === "fulfilled"
        ? result.value
        : { error: String(result.reason) },
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
