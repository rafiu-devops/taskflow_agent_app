import type { ConversationSummary } from "@/types/agent";

export type ConversationGroup = { label: string; items: ConversationSummary[] };

export type GroupingPreset = "sidebar" | "page";

const DAY = 86_400_000;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Bucket conversations into Today / Yesterday / older.
 * `sidebar` keeps a tighter "Previous 7 days" bucket, `page` uses a single
 * "Earlier" bucket so the history page stays easy to scan.
 */
export function groupConversations(
  items: ConversationSummary[],
  preset: GroupingPreset = "page",
): ConversationGroup[] {
  const now = new Date();
  const today = startOfDay(now);
  const yesterday = new Date(today.getTime() - DAY);
  const week = new Date(today.getTime() - 7 * DAY);

  const buckets = new Map<string, ConversationSummary[]>();
  const order: string[] = [];

  const push = (label: string, item: ConversationSummary) => {
    if (!buckets.has(label)) {
      buckets.set(label, []);
      order.push(label);
    }
    buckets.get(label)!.push(item);
  };

  for (const item of items) {
    const date = new Date(item.updatedAt);
    const valid = !Number.isNaN(date.getTime());
    const day = valid ? startOfDay(date) : null;

    if (day && day.getTime() >= today.getTime()) push("Today", item);
    else if (day && day.getTime() >= yesterday.getTime()) push("Yesterday", item);
    else if (preset === "sidebar" && day && day.getTime() >= week.getTime())
      push("Previous 7 days", item);
    else push("Earlier", item);
  }

  return order
    .map((label) => ({ label, items: buckets.get(label)! }))
    .filter((group) => group.items.length > 0);
}

/** Compact relative timestamp used in list rows. */
export function relativeTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "Just now";

  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Exact timestamp for tooltips / accessible labels. */
export function fullTimestamp(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
