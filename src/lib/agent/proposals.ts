import "server-only";
import { randomUUID } from "crypto";
import type { AgentUser } from "@/types/agent";

export interface PendingProposal {
  id: string;
  ownerEmail: string;
  tool: "create_task" | "update_task";
  args: Record<string, unknown>;
  summary: Array<{ label: string; value: string }>;
  expiresAt: number;
  used: boolean;
}

const proposals = new Map<string, PendingProposal>();

export function createProposal(user: AgentUser, tool: PendingProposal["tool"], args: Record<string, unknown>, summary: PendingProposal["summary"]): PendingProposal {
  const proposal: PendingProposal = {
    id: randomUUID(),
    ownerEmail: user.email,
    tool,
    args,
    summary,
    expiresAt: Date.now() + 10 * 60 * 1000,
    used: false,
  };
  proposals.set(proposal.id, proposal);
  return proposal;
}

export function getProposal(id: string, user: AgentUser): PendingProposal | null {
  const proposal = proposals.get(id);
  if (!proposal || proposal.ownerEmail !== user.email) return null;
  if (proposal.used) return null;
  if (Date.now() > proposal.expiresAt) return null;
  return proposal;
}

export function markProposalUsed(id: string) {
  const proposal = proposals.get(id);
  if (proposal) proposal.used = true;
}
