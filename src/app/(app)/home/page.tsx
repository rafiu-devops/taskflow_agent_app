import HomeClient from "@/components/home/HomeClient";
import { requireAgentUser } from "@/lib/auth/server";

export default async function HomePage() {
  const user = await requireAgentUser();
  return <HomeClient user={user} />;
}
