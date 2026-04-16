import { type AgentMatch, type AgentProfile, type MatchBreakdown, type WorkspaceBrief, type WorkspaceMatch } from "./types";

const tokenize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);

const jaccard = (left: string[], right: string[]) => {
  const a = new Set(left);
  const b = new Set(right);
  const union = new Set([...a, ...b]);

  if (union.size === 0) {
    return 0;
  }

  let intersection = 0;

  for (const value of a) {
    if (b.has(value)) {
      intersection += 1;
    }
  }

  return intersection / union.size;
};

const average = (values: number[]) =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

export const computeBreakdown = (
  agent: AgentProfile,
  workspace: WorkspaceBrief,
  graphProximity: number,
  paperHistory: number,
  skillFit: number,
): MatchBreakdown => {
  const semanticSimilarity = jaccard(
    tokenize(
      [
        agent.researchDescription,
        agent.headline,
        ...agent.researchInterests,
        ...agent.capabilities,
      ].join(" "),
    ),
    tokenize(
      [
        workspace.abstract,
        workspace.ideaSummary,
        workspace.experimentalLog,
        ...workspace.tags,
        ...workspace.desiredRoles,
      ].join(" "),
    ),
  );

  const topicOverlap = jaccard(agent.researchInterests, workspace.tags);
  const capabilityFit = average(
    workspace.desiredRoles.map((role) =>
      agent.preferredRoles.concat(agent.capabilities).some((item) =>
        item.toLowerCase().includes(role.toLowerCase()),
      )
        ? 1
        : 0,
    ),
  );
  const priorSuccess = average([
    agent.reliability.acceptedContributionRate,
    agent.reliability.citationAccuracy,
    agent.reliability.compileSuccessRate,
  ]);

  const total =
    semanticSimilarity * 0.3 +
    topicOverlap * 0.2 +
    capabilityFit * 0.15 +
    skillFit * 0.1 +
    priorSuccess * 0.1 +
    graphProximity * 0.1 +
    paperHistory * 0.05;

  return {
    semanticSimilarity,
    topicOverlap,
    capabilityFit,
    skillFit,
    priorSuccess,
    graphProximity,
    paperHistory,
    total,
  };
};

export const breakdownReasons = (breakdown: MatchBreakdown, workspace: WorkspaceBrief, agent: AgentProfile) => {
  const reasons: string[] = [];

  if (breakdown.topicOverlap > 0.3) {
    reasons.push(`Overlapping interests across ${workspace.tags.slice(0, 3).join(", ")}`);
  }

  if (breakdown.capabilityFit > 0.4) {
    reasons.push(`Role fit for ${workspace.desiredRoles.slice(0, 2).join(" and ")}`);
  }

  if (
    (workspace.requiredSkillIds.length > 0 || workspace.preferredSkillIds.length > 0) &&
    breakdown.skillFit > 0.45
  ) {
    reasons.push("Installed skills cover the workspace workflow requirements");
  }

  if (breakdown.paperHistory > 0.3) {
    reasons.push("Relevant paper history in the same topic cluster");
  }

  if (breakdown.graphProximity > 0.2) {
    reasons.push("Prior collaborator graph overlap improves trust");
  }

  if (breakdown.priorSuccess > 0.75) {
    reasons.push("High reliability across review, citations, and compile outcomes");
  }

  if (reasons.length === 0) {
    reasons.push(`Semantic fit between ${agent.displayName} and ${workspace.title}`);
  }

  return reasons;
};

export const sortWorkspaceMatches = (matches: WorkspaceMatch[]) =>
  matches.sort((left, right) => right.breakdown.total - left.breakdown.total);

export const sortAgentMatches = (matches: AgentMatch[]) =>
  matches.sort((left, right) => right.breakdown.total - left.breakdown.total);
