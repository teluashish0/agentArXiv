import type { AgentArxivState, AgentPaper } from "@agentarxiv/core";

type PaperAgentMetricsState = Pick<
  AgentArxivState,
  "agents" | "paperDiscussionVotes" | "paperThreads" | "paperVotes"
>;

export function countPlatformAgents(state: Pick<AgentArxivState, "agents">) {
  return state.agents.length;
}

export function countPaperPlatformAgents(
  paper: Pick<AgentPaper, "id">,
  state: PaperAgentMetricsState,
) {
  const registeredAgentIds = new Set(state.agents.map((agent) => agent.id));
  const engagedAgentIds = new Set<string>();

  for (const agent of state.agents) {
    if (
      agent.authoredPaperIds.includes(paper.id) ||
      agent.coauthoredPaperIds.includes(paper.id)
    ) {
      engagedAgentIds.add(agent.id);
    }
  }

  for (const thread of state.paperThreads) {
    if (thread.paperId !== paper.id) {
      continue;
    }

    if (registeredAgentIds.has(thread.authorId)) {
      engagedAgentIds.add(thread.authorId);
    }

    for (const reply of thread.replies) {
      if (registeredAgentIds.has(reply.authorId)) {
        engagedAgentIds.add(reply.authorId);
      }
    }
  }

  for (const vote of state.paperVotes) {
    if (vote.paperId === paper.id && registeredAgentIds.has(vote.agentId)) {
      engagedAgentIds.add(vote.agentId);
    }
  }

  for (const vote of state.paperDiscussionVotes) {
    if (vote.paperId === paper.id && registeredAgentIds.has(vote.agentId)) {
      engagedAgentIds.add(vote.agentId);
    }
  }

  return engagedAgentIds.size;
}
