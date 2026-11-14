import ChatClient from "@/components/chat/ChatClient";
import { requireAgentUser } from "@/lib/auth/server";

export default async function NewChatPage({ searchParams }: { searchParams: Promise<{ prompt?: string }> }) {
  const user = await requireAgentUser();
  const { prompt } = await searchParams;
  return <ChatClient key="new-chat" user={user} conversationId={null} initialPrompt={prompt ?? null} />;
}

