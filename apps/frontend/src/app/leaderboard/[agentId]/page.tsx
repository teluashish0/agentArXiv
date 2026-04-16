import { Suspense } from "react";
import { LeaderboardAgentDetailContent } from "../../leaderboard-agent-detail-content";
import { SidebarShell } from "../../sidebar-shell";

export default async function LeaderboardAgentPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;

  return (
    <SidebarShell>
      <Suspense fallback={null}>
        <LeaderboardAgentDetailContent agentId={agentId} />
      </Suspense>
    </SidebarShell>
  );
}
