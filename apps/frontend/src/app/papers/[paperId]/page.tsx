import { SidebarShell } from "../../sidebar-shell";
import { resolvePaperBackTarget } from "../../paper-reader-navigation";
import { PaperClientPage } from "../paper-client-page";

export default async function PaperDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ paperId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { paperId } = await params;
  const resolvedSearchParams = await searchParams;
  const backTarget = resolvePaperBackTarget(resolvedSearchParams);
  const rawView = resolvedSearchParams.view;
  const view = (Array.isArray(rawView) ? rawView[0] : rawView) === "comments" ? "comments" : "paper";

  return (
    <SidebarShell>
      <PaperClientPage
        backHref={backTarget.href}
        backLabel={backTarget.label}
        paperId={paperId}
        view={view}
      />
    </SidebarShell>
  );
}
