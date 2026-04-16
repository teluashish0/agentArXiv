import type { ExplorePaperDetail } from "./paper-view-model";
import type { WorkspaceLatexDocument } from "./workspace-paper-data";
import type {
  WorkspaceChatSeedMessage,
  WorkspaceChatSurfaceContext,
} from "./workspace-chat-context";

export type PaperChatSurface = "paper";

export type PaperChatSurfaceContext = Omit<WorkspaceChatSurfaceContext, "surface"> & {
  surface: PaperChatSurface;
};

export function buildPaperThreadId(paperId: string) {
  return `paper-${paperId}`;
}

export function buildPaperThreadTitle(paperTitle: string) {
  return `${paperTitle} Q&A`;
}

function buildPaperManuscriptText(document: WorkspaceLatexDocument) {
  const lines: string[] = [`# ${document.paperTitle}`];

  if (document.abstractText?.trim()) {
    lines.push("", "## Abstract", document.abstractText.trim());
  }

  if (document.keywords?.length) {
    lines.push("", `Keywords: ${document.keywords.join(", ")}`);
  }

  for (const sectionId of document.sectionOrder) {
    const section = document.sections.find((item) => item.id === sectionId);

    if (!section) {
      continue;
    }

    lines.push("", `## ${section.title}`);
    lines.push(section.initialText.trim() || section.liveText?.trim() || "No published text available.");
  }

  if (document.references?.length) {
    lines.push("", "## References", document.references.join("\n"));
  }

  return lines.join("\n");
}

function buildPaperSeedMessages(
  paper: ExplorePaperDetail,
  sections: Array<{
    id: string;
    title: string;
    pageNumber: number;
    text: string;
  }>,
): WorkspaceChatSeedMessage[] {
  const focus = (paper.showcase || paper.summary).trim();
  const sectionSummary = sections
    .slice(0, 3)
    .map((section) => section.title)
    .join(", ");

  const content = [
    focus ? `Research snapshot: ${focus}` : null,
    sectionSummary ? `Start with: ${sectionSummary}.` : null,
    "Ask about the methodology, equations, figures, or benchmark evidence tied to this paper.",
  ]
    .filter(Boolean)
    .join(" ");

  return [
    {
      id: `${paper.id}:paper-guide`,
      agentId: "paper_guide",
      agentName: "Paper Guide",
      agentAccent: "#5f718d",
      content,
    },
  ];
}

export function buildPaperChatContext(
  paper: ExplorePaperDetail,
  document: WorkspaceLatexDocument,
  threadId = buildPaperThreadId(paper.id),
  workspaceId = paper.id,
): PaperChatSurfaceContext {
  const collaborators =
    paper.discussionAgents.length > 0
      ? paper.discussionAgents.map((agent) => ({
          id: agent.id,
          name: agent.name,
          role: agent.role,
          accent: agent.accent,
        }))
      : paper.authors.map((author, index) => ({
          id: `author-${index}`,
          name: author,
          role: "Author",
          accent: "#fa7315",
        }));

  const sections = document.sectionOrder
    .map((sectionId, index) => {
      const section = document.sections.find((item) => item.id === sectionId);

      if (!section) {
        return null;
      }

      return {
        id: section.id,
        title: section.title,
        pageNumber: section.pageHint ?? index + 1,
        text: section.initialText.trim() || section.liveText?.trim() || "",
      };
    })
    .filter(
      (
        section,
      ): section is {
        id: string;
        title: string;
        pageNumber: number;
        text: string;
      } => Boolean(section),
    );

  return {
    workspaceId,
    surface: "paper",
    mode: "workspace",
    threadId,
    threadTitle: buildPaperThreadTitle(paper.title),
    paperTitle: paper.title,
    surfaceTitle: "Published paper",
    manuscriptText: buildPaperManuscriptText(document),
    notebookSummary: "",
    viewerOwnedAgentIds: [],
    collaborators,
    sections,
    seedMessages: buildPaperSeedMessages(paper, sections),
    governanceDecisions: [],
    activeDecision: undefined,
    otherDecisionDigests: [],
    evidenceLinks: [],
  } satisfies PaperChatSurfaceContext;
}
