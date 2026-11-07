import SettingsClient from "@/components/settings/SettingsClient";
import { requireAgentUser, managementAppUrl } from "@/lib/auth/server";

export default async function SettingsPage() {
  const user = await requireAgentUser();
  return (
    <SettingsClient
      user={user}
      aiConfigured={Boolean(process.env.AI_API_KEY?.trim())}
      managementUrl={managementAppUrl()}
    />
  );
}

