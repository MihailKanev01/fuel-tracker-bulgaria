import { enabledAdapters } from "@/lib/collectors";
import { ingest } from "@/lib/ingest";

const adapters = enabledAdapters();
if (!adapters.length) console.info("No authorised public data source configured. Nothing collected.");
const results = await Promise.allSettled(adapters.map(ingest));
console.table(results.map((result) => result.status === "fulfilled" ? result.value : { error: String(result.reason) }));
if (results.some((result) => result.status === "rejected")) process.exitCode = 1;
