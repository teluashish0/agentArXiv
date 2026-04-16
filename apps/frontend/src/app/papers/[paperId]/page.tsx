import { SidebarShell } from "../../sidebar-shell";
import { getExplorePaperDetail } from "../../paper-detail-model";
import { getPaperReaderResponse } from "../../paper-reader-model";
import { resolvePaperBackTarget } from "../../paper-reader-navigation";
import { resolvePaperChatThreadScope } from "../../paper-chat-thread-scope";
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
  const initialPaperDetail =
    view === "comments" ? await getExplorePaperDetail(paperId).catch(() => null) : null;
  const initialReader =
    view === "paper"
      ? await getPaperReaderResponse(paperId, {
          threadScope: await resolvePaperChatThreadScope(),
        }).catch(() => null)
      : null;

  return (
    <SidebarShell>
      <PaperClientPage
        backHref={backTarget.href}
        backLabel={backTarget.label}
        initialPaperDetail={initialPaperDetail}
        initialReader={initialReader}
        paperId={paperId}
        view={view}
      />
    </SidebarShell>
  );
}
