import { repository } from "@/lib/repository";
import { buildVerifiedAgentIdSet } from "./agent-verification";
import {
  buildPaperChatContext,
  type PaperChatSurfaceContext,
} from "./paper-chat-context";
import { buildScopedPaperThreadId } from "./paper-chat-thread";
import type { ExplorePaperDetail, ExplorePaperWorkspacePreview } from "./paper-view-model";
import { toExplorePaperDetail } from "./paper-view-model";
import { getWorkspaceClientModel } from "./workspace/workspace-view-model";
import type {
  WorkspaceLatexDocument,
  WorkspaceLatexDocumentSection,
  WorkspacePaperAuthor,
} from "./workspace-paper-data";

type PaperReaderPaperSource = Pick<
  ExplorePaperDetail,
  | "content"
  | "id"
  | "title"
  | "authors"
  | "summary"
  | "showcase"
  | "tags"
  | "discussionAgents"
>;

export type PaperReaderPaper = Pick<PaperReaderPaperSource, "id" | "title">;

export type PaperReaderResponse = {
  paper: PaperReaderPaper;
  document: WorkspaceLatexDocument;
  chatContext: PaperChatSurfaceContext;
};

async function getAgentArxivPaperDetailById(paperId: string) {
  const record = await repository.getPublicPaperRecord(paperId);
  const state = await repository.getState();

  if (record.paper.sourceType !== "agentarxiv") {
    throw new Error("Paper not found");
  }

  const workspaceModel = record.paper.workspaceId
    ? await getWorkspaceClientModel(record.paper.workspaceId).catch(() => null)
    : null;
  const workspacePreview: ExplorePaperWorkspacePreview | undefined = workspaceModel
    ? {
        agents: workspaceModel.agents,
        draftDocument: workspaceModel.draftDocument,
      }
    : undefined;
  const verifiedAgentIds = buildVerifiedAgentIdSet(state);
  const paper = toExplorePaperDetail(
    record,
    workspacePreview,
    state.agents,
    verifiedAgentIds,
  );

  return {
    paper,
    workspaceId: record.paper.workspaceId,
    workspacePreview,
  };
}

function buildFallbackAuthors(authors: string[]): WorkspacePaperAuthor[] {
  return authors.map((author) => ({
    id: author,
    name: author,
    affiliation: "",
    location: "",
    email: "",
  }));
}

function toReadOnlySection(
  section: WorkspaceLatexDocumentSection,
): WorkspaceLatexDocumentSection {
  return {
    ...section,
    agentId: undefined,
    liveText: undefined,
    isTyping: false,
    initialText: section.liveText?.trim() || section.initialText,
    targetText: "",
    startDelay: 0,
    stepEvery: 1,
  };
}

function buildFallbackDocument(paper: PaperReaderPaperSource): WorkspaceLatexDocument {
  return {
    id: "draft",
    title: "Published paper",
    templateId: "arxiv-labs-template",
    paperTitle: paper.title,
    authors: buildFallbackAuthors(paper.authors),
    abstractText: paper.summary || paper.showcase,
    keywords: paper.tags,
    references: [],
    sectionOrder: ["published-manuscript"],
    preambleLines: [],
    sections: [
      {
        id: "published-manuscript",
        slotId: "published-manuscript",
        title: "Published Manuscript",
        role: "publication",
        heading: "\\section{Published Manuscript}",
        initialText: paper.content?.trim() || paper.showcase || paper.summary,
        targetText: "",
        startDelay: 0,
        stepEvery: 1,
      },
    ],
    closingLines: [],
  };
}

function buildReadOnlyDocument(
  paper: PaperReaderPaperSource,
  workspacePreview?: ExplorePaperWorkspacePreview,
) {
  const sourceDocument = workspacePreview?.draftDocument;

  if (!sourceDocument) {
    return buildFallbackDocument(paper);
  }

  return {
    ...sourceDocument,
    title: "Published paper",
    paperTitle: paper.title,
    authors:
      sourceDocument.authors.length > 0
        ? sourceDocument.authors
        : buildFallbackAuthors(paper.authors),
    abstractText: sourceDocument.abstractText?.trim() || paper.summary || paper.showcase,
    keywords: (sourceDocument.keywords?.length ?? 0) > 0 ? sourceDocument.keywords : paper.tags,
    sections: sourceDocument.sections.map(toReadOnlySection),
  } satisfies WorkspaceLatexDocument;
}

function toPaperReaderPaper(paper: PaperReaderPaperSource): PaperReaderPaper {
  return {
    id: paper.id,
    title: paper.title,
  };
}

export async function getPaperReaderResponse(
  paperId: string,
  options?: {
    threadScope?: string | null;
  },
): Promise<PaperReaderResponse> {
  const { paper, workspacePreview } = await getAgentArxivPaperDetailById(paperId);
  const document = buildReadOnlyDocument(paper, workspacePreview);

  return {
    paper: toPaperReaderPaper(paper),
    document,
    chatContext: buildPaperChatContext(
      paper,
      document,
      buildScopedPaperThreadId(paper.id, options?.threadScope),
    ),
  };
}

export async function getWorkspacePaperChatContext(
  workspaceId: string,
): Promise<PaperChatSurfaceContext> {
  const state = await repository.getState();
  const paperId = state.papers.find(
    (paper) => paper.sourceType === "agentarxiv" && paper.workspaceId === workspaceId,
  )?.id;

  if (!paperId) {
    throw new Error("Paper not found");
  }

  const { paper, workspacePreview } = await getAgentArxivPaperDetailById(paperId);
  const document = buildReadOnlyDocument(paper, workspacePreview);

  return buildPaperChatContext(
    paper,
    document,
    buildScopedPaperThreadId(workspaceId),
    workspaceId,
  );
}
