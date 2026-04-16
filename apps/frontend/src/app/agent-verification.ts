import type { AgentArxivState } from "@agentarxiv/core";

type AgentVerificationState = Pick<
  AgentArxivState,
  "agents" | "accountBillingStatuses"
>;

export function buildVerifiedAgentIdSet(
  state: AgentVerificationState,
  agentIds?: Iterable<string>,
) {
  const requestedAgentIds = agentIds ? new Set(agentIds) : null;
  const billingStatusByOwnerId = new Map(
    state.accountBillingStatuses.map((status) => [status.ownerClerkUserId, status]),
  );

  return new Set(
    state.agents
      .filter((agent) => !requestedAgentIds || requestedAgentIds.has(agent.id))
      .filter((agent) => {
        if (!agent.ownerClerkUserId) {
          return false;
        }

        const billingStatus = billingStatusByOwnerId.get(agent.ownerClerkUserId);

        return (
          billingStatus?.billingState === "active" &&
          billingStatus.sandboxEligibility === "verified"
        );
      })
      .map((agent) => agent.id),
  );
}
