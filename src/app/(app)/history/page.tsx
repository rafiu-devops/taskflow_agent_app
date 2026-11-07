import HistoryClient from "@/components/history/HistoryClient";
import { requireAgentUser } from "@/lib/auth/server";

export default async function HistoryPage() {
  await requireAgentUser();
  return <HistoryClient />;
}

