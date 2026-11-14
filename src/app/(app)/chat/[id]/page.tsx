import ChatClient from "@/components/chat/ChatClient";
import { requireAgentUser } from "@/lib/auth/server";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAgentUser();
  const { id } = await params;
  return <ChatClient key={`conversation:${id}`} user={user} conversationId={id} />;
}
