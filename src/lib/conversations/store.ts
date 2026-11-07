import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { newId, ownerHash } from "@/lib/auth/server";
import type { ChatMessage, Conversation, ConversationSummary, MessagePart, TextPart } from "@/types/agent";

const DEFAULT_DATA_FILE = path.join(process.cwd(), "data", "conversations.json");
const MAX_MESSAGES = 200;

let writeQueue: Promise<void> = Promise.resolve();

function normalizeMessage(message: unknown): ChatMessage {
  const m = (message && typeof message === "object" ? message : {}) as Record<string, unknown>;
  if (Array.isArray(m.parts)) {
    return {
      id: String(m.id ?? newId("msg")),
      role: m.role === "assistant" ? "assistant" : "user",
      parts: m.parts as MessagePart[],
      createdAt: typeof m.createdAt === "number" ? m.createdAt : Date.parse(String(m.createdAt ?? "")) || Date.now(),
    };
  }
  const text = typeof m.content === "string" ? m.content : "";
  const parts: MessagePart[] = text ? [{ type: "text", text }] : [];
  if (Array.isArray(m.cards)) {
    for (const card of m.cards as unknown[]) {
      const c = (card && typeof card === "object" ? card : {}) as Record<string, unknown>;
      parts.push({ type: "tool-result", id: String(c.id ?? newId("tool")), tool: String(c.type ?? "unknown"), state: "done", output: c });
    }
  }
  return {
    id: String(m.id ?? newId("msg")),
    role: m.role === "assistant" ? "assistant" : "user",
    parts,
    createdAt: typeof m.createdAt === "number" ? m.createdAt : Date.parse(String(m.createdAt ?? "")) || Date.now(),
  };
}

function dataFile(): string {
  return process.env.CONVERSATION_DATA_FILE || DEFAULT_DATA_FILE;
}

async function readConversations(): Promise<Conversation[]> {
  try {
    const raw = await fs.readFile(/* turbopackIgnore: true */ dataFile(), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as Conversation[]).map((conversation) => ({
      ...conversation,
      messages: (conversation.messages ?? []).map((message: unknown) => normalizeMessage(message)),
    }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    console.error("Unable to read conversation store", error);
    return [];
  }
}

async function writeConversations(conversations: Conversation[]): Promise<void> {
  const file = dataFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, JSON.stringify(conversations, null, 2), "utf8");
  await fs.rename(temp, file);
}

function withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(operation, operation);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function toSummary(conversation: Conversation): ConversationSummary {
  const last = conversation.messages[conversation.messages.length - 1];
  return {
    id: conversation.id,
    ownerId: conversation.ownerId,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messageCount: conversation.messages.length,
    lastMessage: last?.parts.filter((part): part is TextPart => part.type === "text").map((part) => part.text).join(" ").slice(0, 140),
  };
}

export async function listConversations(ownerEmail: string): Promise<ConversationSummary[]> {
  const ownerId = ownerHash(ownerEmail);
  const conversations = await readConversations();
  return conversations
    .filter((conversation) => conversation.ownerId === ownerId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(toSummary);
}

export async function getConversation(id: string, ownerEmail: string): Promise<Conversation | null> {
  const ownerId = ownerHash(ownerEmail);
  const conversations = await readConversations();
  const conversation = conversations.find((item) => item.id === id && item.ownerId === ownerId);
  return conversation ?? null;
}

export async function createConversation(ownerEmail: string, title = "New conversation"): Promise<Conversation> {
  const ownerId = ownerHash(ownerEmail);
  const now = new Date().toISOString();
  const conversation: Conversation = {
    id: newId("conv"),
    ownerId,
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  return withWriteLock(async () => {
    const conversations = await readConversations();
    conversations.push(conversation);
    await writeConversations(conversations);
    return conversation;
  });
}

export async function appendMessage(
  id: string,
  ownerEmail: string,
  message: { role: "user" | "assistant"; parts: MessagePart[] },
): Promise<Conversation> {
  const ownerId = ownerHash(ownerEmail);
  return withWriteLock(async () => {
    const conversations = await readConversations();
    const index = conversations.findIndex((item) => item.id === id && item.ownerId === ownerId);
    if (index < 0) throw new Error("Conversation not found");
    const conversation = conversations[index];
    const now = Date.now();
    const nextMessage = {
      id: newId("msg"),
      role: message.role,
      parts: message.parts,
      createdAt: now,
    };
    conversation.messages = [...conversation.messages, nextMessage].slice(-MAX_MESSAGES);
    conversation.updatedAt = new Date(now).toISOString();
    if (conversation.title === "New conversation" && message.role === "user") {
      const text = message.parts.filter((part): part is TextPart => part.type === "text").map((part) => part.text).join(" ").trim();
      conversation.title = text.replace(/\s+/g, " ").slice(0, 64) || "New conversation";
    }
    conversations[index] = conversation;
    await writeConversations(conversations);
    return conversation;
  });
}

export async function renameConversation(id: string, ownerEmail: string, title: string): Promise<ConversationSummary> {
  const ownerId = ownerHash(ownerEmail);
  const trimmed = title.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!trimmed) throw new Error("Conversation title cannot be empty");
  return withWriteLock(async () => {
    const conversations = await readConversations();
    const index = conversations.findIndex((item) => item.id === id && item.ownerId === ownerId);
    if (index < 0) throw new Error("Conversation not found");
    conversations[index] = { ...conversations[index], title: trimmed, updatedAt: new Date().toISOString() };
    await writeConversations(conversations);
    return toSummary(conversations[index]);
  });
}

export async function deleteConversation(id: string, ownerEmail: string): Promise<boolean> {
  const ownerId = ownerHash(ownerEmail);
  return withWriteLock(async () => {
    const conversations = await readConversations();
    const next = conversations.filter((item) => !(item.id === id && item.ownerId === ownerId));
    if (next.length === conversations.length) return false;
    await writeConversations(next);
    return true;
  });
}

