import "server-only";
import { db } from "@/lib/firebaseAdmin";
import { ownerHash } from "@/lib/auth/server";
import type { AgentUser } from "@/types/agent";
import { getAiConfig } from "@/lib/ai/config";

const COLLECTION = "taskflow_memory";

function memoryDoc(user: AgentUser) {
  return db.collection(COLLECTION).doc(ownerHash(user.email));
}

export async function getMemory(user: AgentUser): Promise<string> {
  try {
    const snapshot = await memoryDoc(user).get();
    if (!snapshot.exists) return "";
    const data = snapshot.data() as Record<string, unknown> | undefined;
    return typeof data?.summary === "string" ? data.summary.trim() : "";
  } catch (error) {
    console.error("Failed to load memory", error);
    return "";
  }
}

export async function updateMemory(user: AgentUser, userMessage: string, assistantMessage: string): Promise<void> {
  const config = getAiConfig();
  if (!config) return;

  const current = await getMemory(user);
  const prompt = [
    "You maintain concise long-term memory for a TaskFlow assistant user.",
    "Update the memory using the new exchange. Keep only durable, useful facts: preferences, decisions, workflows, project context, naming conventions, unresolved issues.",
    "Do not store temporary details, greetings, or business records that should be fetched live.",
    "If the user corrects an earlier fact, replace it.",
    "Return only the updated memory text, maximum 900 characters. If nothing durable changed, return the previous memory unchanged.",
  ].join(" ");

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: `Previous memory:\n${current || "(empty)"}\n\nNew exchange:\nUser: ${userMessage}\nAssistant: ${assistantMessage}` },
      ],
      temperature: 0.1,
    }),
    cache: "no-store",
  });

  if (!response.ok) return;
  const payload = (await response.json().catch(() => null)) as { choices?: Array<{ message?: { content?: string } }> } | null;
  const summary = payload?.choices?.[0]?.message?.content?.trim();
  if (!summary) return;

  await memoryDoc(user).set(
    {
      ownerHash: ownerHash(user.email),
      ownerEmail: user.email,
      summary: summary.slice(0, 1000),
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}