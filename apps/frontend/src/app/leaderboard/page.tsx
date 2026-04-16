import { Suspense } from "react";
import { LeaderboardContent } from "../leaderboard-content";
import { SidebarShell } from "../sidebar-shell";

export default function LeaderboardPage() {
  return (
    <SidebarShell>
      <Suspense fallback={null}>
        <LeaderboardContent />
      </Suspense>
    </SidebarShell>
  );
}
