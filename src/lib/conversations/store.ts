import "server-only";

import { Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import { db } from "@/lib/firebaseAdmin";
import { newId, ownerHash } from "@/lib/auth/server";
import type { AgentUser } from "@/types/agent";
import type {
  ChatMessage,
  Conversation,
  ConversationSummary,
  MessagePart,
  TextPart,
} from "@/types/agent";

const COLLECTION = "taskflow_chats";
const MAX_MESSAGES = 200;

function toIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
  return new Date().toISOString();
}

function toMillis(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? Date.now() : parsed;
  }
  if (value instanceof Date) return value.getTime();
  return Date.now();
}

function normalizeFirestoreMessage(id: string, data: Record<string, unknown>): ChatMessage {
  const role = data.role === "assistant" ? "assistant" : "user";
  let parts: MessagePart[] = [];
  if (Array.isArray(data.parts)) {
    parts = data.parts as MessagePart[];
  } else {
    const text = typeof data.content === "string" ? data.content : "";
    parts = text ? [{ type: "text", text }] : [];
  }
  return {
    id,
    role,
    parts,
    createdAt: toMillis(data.timestamp ?? data.createdAt),
  };
}

function summaryFromDoc(doc: DocumentSnapshot): ConversationSummary {
  const data = (doc.data() ?? {}) as Record<string, unknown>;
  const ownerId = String(data.ownerHash ?? "");
  const content = typeof data.lastMessage === "string" ? data.lastMessage : undefined;
  return {
    id: doc.id,
    ownerId,
    ownerEmail: typeof data.ownerEmail === "string" ? data.ownerEmail : undefined,
    role: data.role === "employee" ? "employee" : data.role === "admin" ? "admin" : undefined,
    title: String(data.title ?? "New conversation"),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    messageCount: typeof data.messageCount === "number" ? data.messageCount : 0,
    lastMessage: content,
  };
}

function textFromParts(parts: MessagePart[]): string {
  return parts
    .filter((part): part is TextPart => part.type === "text")
    .map((part) => part.text)
    .join(" ")
    .trim();
}

export async function listConversations(user: AgentUser): Promise<ConversationSummary[]> {
  const ownerId = ownerHash(user.email);
  const snapshot = await db.collection(COLLECTION).where("ownerHash", "==", ownerId).get();
  return snapshot.docs
    .map((doc) => summaryFromDoc(doc))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getConversation(id: string, user: AgentUser): Promise<Conversation | null> {
  const ownerId = ownerHash(user.email);
  const ref = db.collection(COLLECTION).doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) return null;
  const data = (snapshot.data() ?? {}) as Record<string, unknown>;
  if (data.ownerHash !== ownerId) return null;

  const messagesSnapshot = await ref
    .collection("messages")
    .orderBy("timestamp", "asc")
    .limit(MAX_MESSAGES)
    .get();

  const messages = messagesSnapshot.docs.map((doc) =>
    normalizeFirestoreMessage(doc.id, (doc.data() ?? {}) as Record<string, unknown>),
  );

  return {
    id: snapshot.id,
    ownerId: String(data.ownerHash ?? ""),
    ownerEmail: typeof data.ownerEmail === "string" ? data.ownerEmail : undefined,
    role: data.role === "employee" ? "employee" : data.role === "admin" ? "admin" : undefined,
    title: String(data.title ?? "New conversation"),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    messages,
  };
}

export async function createConversation(
  user: AgentUser,
  title = "New conversation",
): Promise<Conversation> {
  const ownerId = ownerHash(user.email);
  const id = newId("conv");
  const now = Timestamp.now();
  await db.collection(COLLECTION).doc(id).set({
    ownerHash: ownerId,
    ownerEmail: user.email,
    role: user.role,
    title,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    lastMessage: null,
  });

  return {
    id,
    ownerId,
    ownerEmail: user.email,
    role: user.role,
    title,
    createdAt: now.toDate().toISOString(),
    updatedAt: now.toDate().toISOString(),
    messages: [],
  };
}

export async function appendMessage(
  id: string,
  user: AgentUser,
  message: { role: "user" | "assistant"; parts: MessagePart[] },
): Promise<Conversation> {
  const ownerId = ownerHash(user.email);
  const ref = db.collection(COLLECTION).doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new Error("Conversation not found");
  const data = (snapshot.data() ?? {}) as Record<string, unknown>;
  if (data.ownerHash !== ownerId) throw new Error("Conversation not found");

  const now = Timestamp.now();
  const messageId = newId("msg");
  const content = textFromParts(message.parts);
  const currentTitle = String(data.title ?? "New conversation");
  let nextTitle = currentTitle;
  if (currentTitle === "New conversation" && message.role === "user") {
    nextTitle = content.replace(/\s+/g, " ").slice(0, 64) || "New conversation";
  }

  const toolResult = message.parts.find(
    (part): part is Extract<MessagePart, { type: "tool-result" }> => part.type === "tool-result",
  );
  const hasError = message.parts.some(
    (part) => part.type === "tool-result" && (part as { state?: string }).state === "error",
  );
  const status = message.role === "assistant" ? (hasError ? "error" : "success") : undefined;

  const cards = message.parts
    .filter((part): part is Extract<MessagePart, { type: "tool-result" }> => part.type === "tool-result")
    .map((part) => (part as { output?: { card?: unknown } }).output?.card)
    .filter(Boolean);

  const uiMetadata = cards.length > 0 ? { cards } : undefined;

  await ref.collection("messages").doc(messageId).set({
    role: message.role,
    parts: message.parts,
    content,
    timestamp: now,
    ...(toolResult ? { toolUsed: (toolResult as { tool?: string }).tool } : {}),
    ...(status ? { status } : {}),
    ...(uiMetadata ? { uiMetadata } : {}),
  });

  const messageCount =
    (typeof data.messageCount === "number" ? data.messageCount : 0) + 1;
  const lastMessage = content
    ? content.slice(0, 140)
    : typeof data.lastMessage === "string"
      ? data.lastMessage
      : null;

  await ref.update({
    title: nextTitle,
    updatedAt: now,
    messageCount,
    lastMessage,
  });

  const updated = await getConversation(id, user);
  if (!updated) throw new Error("Conversation not found");
  return updated;
}

export async function renameConversation(
  id: string,
  user: AgentUser,
  title: string,
): Promise<ConversationSummary> {
  const ownerId = ownerHash(user.email);
  const trimmed = title.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!trimmed) throw new Error("Conversation title cannot be empty");

  const ref = db.collection(COLLECTION).doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new Error("Conversation not found");
  const data = (snapshot.data() ?? {}) as Record<string, unknown>;
  if (data.ownerHash !== ownerId) throw new Error("Conversation not found");

  await ref.update({ title: trimmed, updatedAt: Timestamp.now() });
  const updated = await ref.get();
  return summaryFromDoc(updated);
}

export async function deleteConversation(id: string, user: AgentUser): Promise<boolean> {
  const ownerId = ownerHash(user.email);
  const ref = db.collection(COLLECTION).doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) return false;
  const data = (snapshot.data() ?? {}) as Record<string, unknown>;
  if (data.ownerHash !== ownerId) return false;

  await db.recursiveDelete(ref);
  return true;
}
