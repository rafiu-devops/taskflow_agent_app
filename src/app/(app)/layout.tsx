import AppShell from "@/components/layout/AppShell";
import { requireAgentUser } from "@/lib/auth/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAgentUser();
  return <AppShell user={user}>{children}</AppShell>;
}
