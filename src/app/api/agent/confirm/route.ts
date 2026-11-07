import { NextResponse } from "next/server";
import { getManagementUser } from "@/lib/auth/server";
import { executeTool } from "@/lib/ai/tools";
import { getProposal, markProposalUsed } from "@/lib/agent/proposals";

export async function POST(request: Request) {
  const user = await getManagementUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const proposalId = String((body as { proposalId?: unknown })?.proposalId ?? "");
  const decision = String((body as { decision?: unknown })?.decision ?? "");

  const proposal = getProposal(proposalId, user);
  if (!proposal) return NextResponse.json({ error: "Proposal expired or not found." }, { status: 404 });

  if (decision === "cancel") {
    markProposalUsed(proposal.id);
    return NextResponse.json({ ok: true, cancelled: true });
  }

  if (decision !== "confirm") {
    return NextResponse.json({ error: "Invalid decision." }, { status: 400 });
  }

  const result = await executeTool(proposal.tool, proposal.args, { user });
  markProposalUsed(proposal.id);
  return NextResponse.json({ ok: result.ok, result });
}
