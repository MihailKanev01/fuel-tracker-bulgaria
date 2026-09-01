import { Dashboard } from "@/components/dashboard";
import { ensureInitialData } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function Home() {
  await ensureInitialData();
  return <Dashboard />;
}
