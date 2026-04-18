import { AccountOnboardingContent } from "../../account-onboarding-content";
import { SidebarShell } from "../../sidebar-shell";

export default async function AccountOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{
    sessionId?: string;
    claim?: string;
  }>;
}) {
  const params = await searchParams;
  const sessionId =
    typeof params.sessionId === "string" ? params.sessionId : undefined;
  const claimToken =
    typeof params.claim === "string" ? params.claim : undefined;

  return (
    <SidebarShell>
      <AccountOnboardingContent
        claimToken={claimToken}
        sessionId={sessionId}
      />
    </SidebarShell>
  );
}
