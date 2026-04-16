"use client";

import Image from "next/image";
import type { WorkspaceReference } from "@agentarxiv/core";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  AtSign,
  CirclePlus,
  Highlighter,
  Paperclip,
  Reply,
  Sparkles,
  X,
} from "lucide-react";
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  type WorkspaceChatAttachmentContext,
  type WorkspaceChatMessageReferenceContext,
  type WorkspaceChatSelectionContext,
  type WorkspaceChatSurface,
  type WorkspaceChatSurfaceContext,
} from "./workspace-chat-context";
import type { PaperChatSurface, PaperChatSurfaceContext } from "./paper-chat-context";
import {
  getWorkspaceSystemEvent,
  isWorkspaceContextMessage,
  type WorkspaceSystemEventKind,
} from "./workspace-chat-events";
import type { WorkspaceCapturedSelection } from "./workspace-latex-surface";
import { SupportErrorMessage } from "./support-error-message";

type WorkspaceConversationMessage = {
  id: string;
  role: "assistant" | "user" | "agent";
  authorId?: string | null;
  authorName: string;
  authorAccent?: string | null;
  content: string;
  selection?: WorkspaceChatSelectionContext | null;
  messageReference?: WorkspaceChatMessageReferenceContext | null;
  references?: WorkspaceReference[];
  attachments?: WorkspaceChatAttachmentContext[];
  createdAt: string;
};

type WorkspaceMessagesResponse = {
  thread_id: string;
  title: string;
  messages: WorkspaceConversationMessage[];
};

type WorkspaceChatKitPaneProps = {
  messagesPath: string;
  surface: WorkspaceChatSurface | PaperChatSurface;
  surfaceContext: WorkspaceChatSurfaceContext | PaperChatSurfaceContext;
  selection: WorkspaceCapturedSelection | null;
  pendingReferences: WorkspaceReference[];
  onOpenDecision?: (decisionId: string) => void;
  onNavigateBack?: () => void;
  onSelectionDismiss: () => void;
  onReferencesChange: (references: WorkspaceReference[]) => void;
};

type WorkspaceMessageReferenceCardProps = {
  collaborators: Array<{ id: string; accent: string }>;
  reference: WorkspaceChatMessageReferenceContext;
  surface: WorkspaceChatSurface | PaperChatSurface;
  variant: "message" | "preview";
  onDismiss?: () => void;
};

type WorkspaceMessageAttachmentListProps = {
  attachments?: WorkspaceChatAttachmentContext[];
};

type WorkspacePendingAttachmentListProps = {
  files: File[];
  onRemove: (fileKey: string) => void;
};

type WorkspaceReferenceCardProps = {
  reference: WorkspaceReference;
  variant: "message" | "preview";
  onDismiss?: () => void;
};

type WorkspaceTimelineEntry = {
  message: WorkspaceConversationMessage;
  systemEvent: {
    kind: WorkspaceSystemEventKind;
    text: string;
    decisionId?: string;
    title?: string;
    outcome?: string;
    required?: boolean;
  } | null;
};

const MAX_PENDING_ATTACHMENTS = 5;
const systemEventDateKeyFormatter = new Intl.DateTimeFormat("en-US", {
  month: "2-digit",
  day: "2-digit",
  year: "numeric",
});
const systemEventDateLabelFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});
const systemEventTimestampFormatter = new Intl.DateTimeFormat("en-US", {
  month: "numeric",
  day: "numeric",
  year: "2-digit",
  hour: "numeric",
  minute: "2-digit",
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function readJsonOrTextResponse(response: Response) {
  const body = await response.text();
  const normalizedBody = body.trim();

  if (!normalizedBody) {
    return null;
  }

  try {
    return JSON.parse(normalizedBody) as unknown;
  } catch {
    return normalizedBody;
  }
}

function getResponseErrorMessage(payload: unknown, fallbackMessage: string) {
  if (typeof payload === "string") {
    return payload || fallbackMessage;
  }

  if (!isRecord(payload)) {
    return fallbackMessage;
  }

  if (typeof payload.detail === "string" && payload.detail.trim()) {
    return payload.detail.trim();
  }

  if (typeof payload.error === "string" && payload.error.trim()) {
    return payload.error.trim();
  }

  return fallbackMessage;
}

function isWorkspaceMessagesResponse(payload: unknown): payload is WorkspaceMessagesResponse {
  return (
    isRecord(payload) &&
    typeof payload.thread_id === "string" &&
    typeof payload.title === "string" &&
    Array.isArray(payload.messages)
  );
}

function normalizeWorkspaceConversationMessage(
  message: WorkspaceConversationMessage,
): WorkspaceConversationMessage {
  return {
    ...message,
    references: message.references ?? [],
    attachments: message.attachments ?? [],
  };
}

function buildWorkspaceReferenceKey(reference: WorkspaceReference) {
  switch (reference.kind) {
    case "artifact":
      return `artifact:${reference.artifactId}`;
    case "manuscript_selection":
      return `selection:${reference.sectionId ?? "passage"}:${reference.pageNumber}:${reference.text}`;
    case "message":
      return `message:${reference.messageId}`;
    case "notebook_cell":
      return `cell:${reference.notebookId}:${reference.cellId}`;
    case "notebook_execution":
      return `execution:${reference.executionId}`;
    case "notebook_output":
      return `output:${reference.executionId}:${reference.outputId}`;
    default:
      return JSON.stringify(reference);
  }
}

function getWorkspaceReferenceMeta(reference: WorkspaceReference) {
  switch (reference.kind) {
    case "artifact":
      return `Artifact · ${reference.artifactType.replace(/_/g, " ")}`;
    case "manuscript_selection":
      return `Selection · Page ${reference.pageNumber}`;
    case "message":
      return `Message · ${reference.authorName}`;
    case "notebook_cell":
      return `Notebook ${reference.cellType} cell`;
    case "notebook_execution":
      return `Execution · ${reference.status}`;
    case "notebook_output":
      return `Output${reference.mimeType ? ` · ${reference.mimeType}` : ""}`;
    default:
      return "Reference";
  }
}

function getWorkspaceReferenceTitle(reference: WorkspaceReference) {
  switch (reference.kind) {
    case "artifact":
    case "notebook_cell":
    case "notebook_execution":
    case "notebook_output":
      return reference.title;
    case "message":
      return reference.sectionTitle?.replace(/^(Proposal|Draft)\s+·\s+/i, "").trim() ?? "Referenced message";
    case "manuscript_selection":
      return reference.sectionTitle?.replace(/^(Proposal|Draft)\s+·\s+/i, "").trim() ?? "Selected passage";
    default:
      return "Reference";
  }
}

function getWorkspaceReferenceExcerpt(reference: WorkspaceReference) {
  switch (reference.kind) {
    case "artifact":
    case "message":
    case "notebook_cell":
    case "notebook_output":
      return reference.excerpt?.trim() || null;
    case "manuscript_selection":
      return reference.text.trim() || null;
    default:
      return null;
  }
}

function getSelectionAccent(
  collaborators: Array<{ id: string; accent: string }>,
  selection: WorkspaceCapturedSelection | WorkspaceChatSelectionContext | null | undefined,
) {
  return collaborators.find((collaborator) => collaborator.id === selection?.agentId)?.accent ?? "#fa7315";
}

function getCollaboratorAccent(
  collaborators: Array<{ id: string; accent: string }>,
  collaboratorId: string | null | undefined,
  fallback: string,
) {
  return collaborators.find((collaborator) => collaborator.id === collaboratorId)?.accent ?? fallback;
}

function getMessageReferenceAccent(
  collaborators: Array<{ id: string; accent: string }>,
  reference: WorkspaceChatMessageReferenceContext | null | undefined,
) {
  if (!reference) {
    return "#5f718d";
  }

  return (
    getCollaboratorAccent(
      collaborators,
      reference.authorId,
      reference.authorAccent ?? "#5f718d",
    ) ??
    "#5f718d"
  );
}

function normalizeMessageExcerpt(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 280);
}

function getAttachmentReferenceExcerpt(attachments?: WorkspaceChatAttachmentContext[]) {
  if (!attachments?.length) {
    return "";
  }

  return attachments
    .map((attachment) => attachment.excerpt?.trim() || attachment.name.trim())
    .filter(Boolean)
    .join(" · ");
}

function buildPendingFileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function clearBrowserSelection() {
  if (typeof window === "undefined") {
    return;
  }

  const domSelection = window.getSelection();

  if (!domSelection) {
    return;
  }

  try {
    domSelection.removeAllRanges();
  } catch {
    // Some browsers can reject selection clearing during unrelated focus transitions.
  }
}

function getSystemEventDateKey(value: string) {
  return systemEventDateKeyFormatter.format(new Date(value));
}

function formatSystemEventDate(value: string) {
  return systemEventDateLabelFormatter.format(new Date(value));
}

function formatSystemEventTimestamp(value: string) {
  return systemEventTimestampFormatter.format(new Date(value));
}

function formatAttachmentSize(sizeBytes?: number | null) {
  if (!sizeBytes || sizeBytes <= 0) {
    return null;
  }

  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(sizeBytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  }

  if (sizeBytes >= 1024) {
    return `${Math.round(sizeBytes / 1024)} KB`;
  }

  return `${sizeBytes} B`;
}

function getMessageReferenceLocationLabel(
  surface: WorkspaceChatSurface | PaperChatSurface,
  reference: WorkspaceChatMessageReferenceContext,
) {
  const locationParts = [];

  if (typeof reference.pageNumber === "number") {
    locationParts.push(`Page ${reference.pageNumber}`);
  }

  if (reference.sectionTitle) {
    locationParts.push(reference.sectionTitle.replace(/^(Proposal|Draft)\s+·\s+/i, "").trim());
  }

  return locationParts.length > 0 ? locationParts.join(" · ") : `Earlier in this ${surface} thread`;
}

function buildMessageReferenceFromMessage(
  message: WorkspaceConversationMessage,
  authorName: string,
  authorAccent: string | null,
  selectionOverride?: WorkspaceChatSelectionContext | null,
): WorkspaceChatMessageReferenceContext | null {
  const resolvedSelection = selectionOverride ?? message.selection;
  const excerpt = normalizeMessageExcerpt(
    message.content || resolvedSelection?.text || getAttachmentReferenceExcerpt(message.attachments),
  );

  if (!excerpt) {
    return null;
  }

  return {
    messageId: message.id,
    authorId: message.authorId ?? null,
    authorName,
    authorAccent,
    excerpt,
    pageNumber: resolvedSelection?.pageNumber,
    sectionTitle: resolvedSelection?.sectionTitle
      ? resolvedSelection.sectionTitle.replace(/^(Proposal|Draft)\s+·\s+/i, "").trim()
      : undefined,
  };
}

function renderInlineMessageContent(content: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;
  let partIndex = 0;

  while ((match = pattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(content.slice(lastIndex, match.index));
    }

    if (match[2] !== undefined) {
      nodes.push(
        <strong key={`${keyPrefix}-strong-${partIndex}`}>
          {match[2]}
        </strong>,
      );
    } else if (match[3] !== undefined) {
      nodes.push(
        <code key={`${keyPrefix}-code-${partIndex}`}>
          {match[3]}
        </code>,
      );
    } else if (match[4] !== undefined) {
      nodes.push(
        <em key={`${keyPrefix}-em-${partIndex}`}>
          {match[4]}
        </em>,
      );
    }

    lastIndex = pattern.lastIndex;
    partIndex += 1;
  }

  if (lastIndex < content.length) {
    nodes.push(content.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [content];
}

function renderFormattedMessageContent(content: string) {
  const normalizedContent = content
    .replace(/\r\n/g, "\n")
    .replace(/([:.!?])\s+-\s+(?=[A-Za-z0-9(])/g, "$1\n- ")
    .trim();

  if (!normalizedContent) {
    return null;
  }

  const lines = normalizedContent.split("\n");
  const blocks: Array<
    | { kind: "paragraph"; text: string }
    | { kind: "list"; items: string[]; ordered: boolean }
  > = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let orderedList = false;

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }

    blocks.push({
      kind: "paragraph",
      text: paragraphLines.join(" "),
    });
    paragraphLines = [];
  };

  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }

    blocks.push({
      kind: "list",
      items: [...listItems],
      ordered: orderedList,
    });
    listItems = [];
    orderedList = false;
  };

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      flushParagraph();
      flushList();
      continue;
    }

    const unorderedMatch = trimmedLine.match(/^[-*]\s+(.+)$/);
    const orderedMatch = trimmedLine.match(/^(\d+)\.\s+(.+)$/);

    if (unorderedMatch) {
      const unorderedItem = unorderedMatch[1] ?? trimmedLine;
      flushParagraph();

      if (listItems.length === 0) {
        orderedList = false;
      }

      if (orderedList) {
        flushList();
      }

      listItems.push(unorderedItem);
      continue;
    }

    if (orderedMatch) {
      const orderedItem = orderedMatch[2] ?? trimmedLine;
      flushParagraph();

      if (listItems.length === 0) {
        orderedList = true;
      }

      if (!orderedList) {
        flushList();
        orderedList = true;
      }

      listItems.push(orderedItem);
      continue;
    }

    flushList();
    paragraphLines.push(trimmedLine);
  }

  flushParagraph();
  flushList();

  return (
    <div className="workspace-chat-rich-text">
      {blocks.map((block, blockIndex) => {
        if (block.kind === "list") {
          const ListTag = block.ordered ? "ol" : "ul";

          return (
            <ListTag className="workspace-chat-rich-list" key={`list-${blockIndex}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`list-${blockIndex}-${itemIndex}`}>
                  {renderInlineMessageContent(item, `list-${blockIndex}-${itemIndex}`)}
                </li>
              ))}
            </ListTag>
          );
        }

        return (
          <p className="workspace-chat-rich-paragraph" key={`paragraph-${blockIndex}`}>
            {renderInlineMessageContent(block.text, `paragraph-${blockIndex}`)}
          </p>
        );
      })}
    </div>
  );
}

function WorkspaceMessageReferenceCard({
  collaborators,
  reference,
  surface,
  variant,
  onDismiss,
}: WorkspaceMessageReferenceCardProps) {
  const referenceAccent = getMessageReferenceAccent(collaborators, reference);
  const locationLabel = getMessageReferenceLocationLabel(surface, reference);

  if (variant === "preview") {
    return (
      <div
        className="workspace-chat-message-reference-preview workspace-chat-message-reference-preview-composer"
        style={
          {
            "--workspace-message-reference-accent": referenceAccent,
          } as CSSProperties
        }
      >
        <div className="workspace-chat-message-reference-preview-top">
          <div className="workspace-chat-message-reference-preview-copy">
            <div className="workspace-chat-message-reference-meta">
              Message · {reference.authorName}
            </div>
            <div className="workspace-chat-message-reference-title">
              {locationLabel}
            </div>
          </div>

          {onDismiss ? (
            <button
              aria-label="Dismiss message reference"
              className="workspace-chat-selection-close"
              onClick={onDismiss}
              type="button"
            >
              <X absoluteStrokeWidth strokeWidth={2.2} />
            </button>
          ) : null}
        </div>

        <p className="workspace-chat-message-reference-body">{reference.excerpt}</p>
      </div>
    );
  }

  return (
    <div
      className="workspace-chat-message-reference"
      style={
        {
          "--workspace-message-reference-accent": referenceAccent,
        } as CSSProperties
      }
    >
      <div className="workspace-chat-message-reference-meta">
        Message · {reference.authorName}
      </div>
      <div className="workspace-chat-message-reference-title">
        {locationLabel}
      </div>
      <p className="workspace-chat-message-reference-body">{reference.excerpt}</p>
    </div>
  );
}

function WorkspaceReferenceCard({
  reference,
  variant,
  onDismiss,
}: WorkspaceReferenceCardProps) {
  const meta = getWorkspaceReferenceMeta(reference);
  const title = getWorkspaceReferenceTitle(reference);
  const excerpt = getWorkspaceReferenceExcerpt(reference);

  if (variant === "preview") {
    return (
      <div className="workspace-chat-reference-preview">
        <div className="workspace-chat-reference-preview-top">
          <div className="workspace-chat-reference-preview-copy">
            <div className="workspace-chat-reference-meta">{meta}</div>
            <div className="workspace-chat-reference-title">{title}</div>
          </div>

          {onDismiss ? (
            <button
              aria-label="Dismiss reference"
              className="workspace-chat-selection-close"
              onClick={onDismiss}
              type="button"
            >
              <X absoluteStrokeWidth strokeWidth={2.2} />
            </button>
          ) : null}
        </div>

        {excerpt ? (
          <p className="workspace-chat-reference-body">{excerpt}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="workspace-chat-reference-card">
      <div className="workspace-chat-reference-meta">{meta}</div>
      <div className="workspace-chat-reference-title">{title}</div>
      {excerpt ? <p className="workspace-chat-reference-body">{excerpt}</p> : null}
    </div>
  );
}

function WorkspaceMessageAttachmentList({ attachments }: WorkspaceMessageAttachmentListProps) {
  if (!attachments?.length) {
    return null;
  }

  return (
    <div className="workspace-chat-attachments">
      {attachments.map((attachment) => {
        const sizeLabel = formatAttachmentSize(attachment.sizeBytes);

        return (
          <a
            className="workspace-chat-attachment-card"
            href={attachment.downloadUrl}
            key={attachment.id}
            rel="noreferrer"
            target="_blank"
          >
            {attachment.previewUrl ? (
              <Image
                alt={attachment.name}
                className="workspace-chat-attachment-preview"
                src={attachment.previewUrl}
                width={56}
                height={56}
              />
            ) : (
              <span className="workspace-chat-attachment-mark" aria-hidden="true">
                <Paperclip absoluteStrokeWidth strokeWidth={2.05} />
              </span>
            )}

            <div className="workspace-chat-attachment-copy">
              <div className="workspace-chat-attachment-meta">
                {attachment.type === "image" ? "Image attachment" : "File attachment"}
                {sizeLabel ? ` · ${sizeLabel}` : ""}
              </div>
              <div className="workspace-chat-attachment-name">
                {attachment.name}
              </div>
              {attachment.excerpt ? (
                <p className="workspace-chat-attachment-excerpt">{attachment.excerpt}</p>
              ) : null}
            </div>
          </a>
        );
      })}
    </div>
  );
}

function WorkspacePendingAttachmentList({
  files,
  onRemove,
}: WorkspacePendingAttachmentListProps) {
  if (files.length === 0) {
    return null;
  }

  return (
    <div className="workspace-chat-attachment-draft-list">
      {files.map((file) => {
        const fileKey = buildPendingFileKey(file);
        const sizeLabel = formatAttachmentSize(file.size);

        return (
          <div className="workspace-chat-attachment-pill" key={fileKey}>
            <span className="workspace-chat-attachment-pill-mark" aria-hidden="true">
              <Paperclip absoluteStrokeWidth strokeWidth={2.05} />
            </span>

            <div className="workspace-chat-attachment-pill-copy">
              <div className="workspace-chat-attachment-pill-name">{file.name}</div>
              <div className="workspace-chat-attachment-pill-meta">
                {sizeLabel ? `${sizeLabel} · queued` : "Queued"}
              </div>
            </div>

            <button
              aria-label={`Remove ${file.name}`}
              className="workspace-chat-attachment-pill-remove"
              onClick={() => {
                onRemove(fileKey);
              }}
              type="button"
            >
              <X absoluteStrokeWidth strokeWidth={2.2} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function normalizeDecisionTitle(title: string) {
  const trimmedTitle = title.trim();

  if (!trimmedTitle) {
    return "Decision";
  }

  const parts = trimmedTitle
    .split(" · ")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length > 1) {
    const lastPart = parts.at(-1);

    if (lastPart && /decision$/i.test(lastPart)) {
      return lastPart;
    }

    return parts.at(-1) ?? trimmedTitle;
  }

  return trimmedTitle;
}

function getDecisionEventTitle(input: {
  title: string;
  required?: boolean;
  resolved?: boolean;
  outcome?: string;
}) {
  const normalizedTitle = normalizeDecisionTitle(input.title);

  if (input.resolved) {
    if (input.outcome === "approved") {
      return `${normalizedTitle} approved`;
    }

    if (input.outcome === "rejected") {
      return `${normalizedTitle} rejected`;
    }

    if (input.outcome === "emergency_override") {
      return `${normalizedTitle} approved by override`;
    }

    return `${normalizedTitle} resolved`;
  }

  return input.required
    ? `${normalizedTitle} requires review`
    : `${normalizedTitle} opened`;
}

function WorkspaceSystemEvent({
  icon,
  decisionId,
  title,
  timestamp,
  onOpen,
  kind,
}: {
  icon?: ReactNode;
  decisionId?: string;
  title: string;
  timestamp?: string;
  onOpen?: (decisionId: string) => void;
  kind?: WorkspaceSystemEventKind;
}) {
  const className = [
    "workspace-chat-system-event",
    kind ? `is-${kind}` : "",
    onOpen && decisionId ? "workspace-chat-system-event-button" : "",
  ]
    .join(" ")
    .trim();
  const content = (
    <>
      <span className="workspace-chat-system-event-mark" aria-hidden="true">
        {icon ?? <ArrowRight absoluteStrokeWidth strokeWidth={2.1} />}
      </span>

      <span className="workspace-chat-system-event-copy">
        <span className="workspace-chat-system-event-text">{title}</span>
        {timestamp ? (
          <time dateTime={timestamp}>{formatSystemEventTimestamp(timestamp)}</time>
        ) : null}
      </span>
    </>
  );

  return (
    <div className="workspace-chat-system-event-row">
      {onOpen && decisionId ? (
        <button
          className={className}
          onClick={() => {
            onOpen(decisionId);
          }}
          type="button"
        >
          {content}
        </button>
      ) : (
        <div className={className}>{content}</div>
      )}
    </div>
  );
}

export function WorkspaceChatKitPane({
  messagesPath,
  surface,
  surfaceContext,
  selection,
  pendingReferences,
  onOpenDecision,
  onNavigateBack,
  onSelectionDismiss,
  onReferencesChange,
}: WorkspaceChatKitPaneProps) {
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const submitLockRef = useRef(false);
  const [messages, setMessages] = useState<WorkspaceConversationMessage[]>([]);
  const [optimisticallyDismissedSelection, setOptimisticallyDismissedSelection] =
    useState<WorkspaceCapturedSelection | null>(null);
  const [pendingMessageReference, setPendingMessageReference] =
    useState<WorkspaceChatMessageReferenceContext | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [threadTitle, setThreadTitle] = useState(
    surfaceContext.threadTitle,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const loadErrorMessage = "Unable to load workspace conversation";
  const sendErrorMessage = "Unable to send workspace message";
  const visibleSelection =
    selection && selection === optimisticallyDismissedSelection ? null : selection;
  const emptyHint = isLoading
    ? "Connecting the shared workspace thread…"
    : `Try asking "${threadTitle === "Proposal collaboration" ? "What constraints are still open in the proposal?" : "What is Delta changing in the runtime loop section?"}"`;
  const inputPlaceholder =
    "Ask anything about this workspace, reference a message, or highlight text...";
  const selectionAccent = getSelectionAccent(surfaceContext.collaborators, visibleSelection);
  const viewerOwnedAgentIds = new Set(surfaceContext.viewerOwnedAgentIds);
  const visibleMessages = messages.flatMap((message): WorkspaceTimelineEntry[] => {
    const hasRenderableContent =
      message.content.trim().length > 0 ||
      Boolean(message.selection) ||
      Boolean(message.messageReference) ||
      (message.references?.length ?? 0) > 0 ||
      (message.attachments?.length ?? 0) > 0;

    if (!hasRenderableContent) {
      return [];
    }

    const systemEvent = getWorkspaceSystemEvent(message);

    if (isWorkspaceContextMessage(message) && !systemEvent) {
      return [];
    }

    return [
      {
        message,
        systemEvent,
      },
    ];
  });
  const showLoadingBlankState =
    isLoading && visibleMessages.length === 0 && !errorMessage;
  const canSubmit =
    chatDraft.trim().length > 0 ||
    Boolean(visibleSelection) ||
    Boolean(pendingMessageReference) ||
    pendingReferences.length > 0 ||
    pendingAttachments.length > 0;
  const hasComposerContext =
    Boolean(visibleSelection) ||
    Boolean(pendingMessageReference) ||
    pendingReferences.length > 0;

  useEffect(() => {
    if (!selection) {
      setOptimisticallyDismissedSelection(null);
    }
  }, [selection]);

  useEffect(() => {
    setThreadTitle(surfaceContext.threadTitle);
  }, [surfaceContext.threadTitle]);

  useEffect(() => {
    let cancelled = false;

    async function loadMessages() {
      try {
        const response = await fetch(messagesPath, {
          cache: "no-store",
        });
        const payload = await readJsonOrTextResponse(response);

        if (!response.ok) {
          throw new Error(getResponseErrorMessage(payload, loadErrorMessage));
        }

        if (!isWorkspaceMessagesResponse(payload)) {
          throw new Error(loadErrorMessage);
        }

        if (!cancelled) {
          setMessages(payload.messages.map(normalizeWorkspaceConversationMessage));
          setThreadTitle(payload.title);
          setErrorMessage(null);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : loadErrorMessage);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    setIsLoading(true);
    void loadMessages();
    const intervalId = window.setInterval(() => {
      void loadMessages();
    }, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [loadErrorMessage, messagesPath, surface]);

  function handleAttachmentSelection(fileList: FileList | null) {
    if (!fileList) {
      return;
    }

    const incomingFiles = Array.from(fileList);

    if (incomingFiles.length === 0) {
      return;
    }

    const seen = new Set(pendingAttachments.map(buildPendingFileKey));
    const nextFiles = [...pendingAttachments];
    let overflowed = false;

    for (const file of incomingFiles) {
      const fileKey = buildPendingFileKey(file);

      if (seen.has(fileKey)) {
        continue;
      }

      if (nextFiles.length >= MAX_PENDING_ATTACHMENTS) {
        overflowed = true;
        break;
      }

      seen.add(fileKey);
      nextFiles.push(file);
    }

    setPendingAttachments(nextFiles);

    setErrorMessage(
      overflowed ? `You can attach up to ${MAX_PENDING_ATTACHMENTS} files per message.` : null,
    );
  }

  async function submitMessage() {
    if (submitLockRef.current || isSending) {
      return;
    }

    const normalizedDraft = chatDraft.trim();
    const draftToSend = normalizedDraft;
    const selectionToSend = selection;
    const messageReferenceToSend = pendingMessageReference;
    const referencesToSend = pendingReferences;
    const attachmentsToSend = pendingAttachments;

    if (
      !normalizedDraft &&
      !selectionToSend &&
      !pendingMessageReference &&
      pendingReferences.length === 0 &&
      pendingAttachments.length === 0
    ) {
      return;
    }

    try {
      submitLockRef.current = true;
      setIsSending(true);
      setOptimisticallyDismissedSelection(selectionToSend);
      setChatDraft("");
      setPendingAttachments([]);
      setPendingMessageReference(null);
      onReferencesChange([]);
      setErrorMessage(null);
      clearBrowserSelection();

      if (attachmentInputRef.current) {
        attachmentInputRef.current.value = "";
      }

      const formData = new FormData();
      formData.append("text", draftToSend);

      if (selectionToSend) {
        formData.append("selection", JSON.stringify(selectionToSend));
      }

      if (messageReferenceToSend) {
        formData.append("messageReference", JSON.stringify(messageReferenceToSend));
      }

      if (referencesToSend.length > 0) {
        formData.append("references", JSON.stringify(referencesToSend));
      }

      for (const attachment of attachmentsToSend) {
        formData.append("files", attachment);
      }

      const response = await fetch(messagesPath, {
        method: "POST",
        body: formData,
      });
      const payload = await readJsonOrTextResponse(response);

      if (!response.ok) {
        throw new Error(getResponseErrorMessage(payload, sendErrorMessage));
      }

      if (!isWorkspaceMessagesResponse(payload)) {
        throw new Error(sendErrorMessage);
      }

      setMessages(payload.messages.map(normalizeWorkspaceConversationMessage));
      setThreadTitle(payload.title);
      setOptimisticallyDismissedSelection(null);
      onSelectionDismiss();
    } catch (error) {
      setChatDraft(draftToSend);
      setPendingAttachments(attachmentsToSend);
      setPendingMessageReference(messageReferenceToSend);
      onReferencesChange(referencesToSend);
      setOptimisticallyDismissedSelection(null);
      setErrorMessage(error instanceof Error ? error.message : sendErrorMessage);
    } finally {
      submitLockRef.current = false;
      setIsSending(false);
    }
  }

  function dismissSelectionPreview() {
    setOptimisticallyDismissedSelection(null);
    clearBrowserSelection();
    onSelectionDismiss();
  }

  return (
    <div className="workspace-chatkit-pane">
      <div
        className={[
          "workspace-chat-shell",
          visibleMessages.length === 0 && !showLoadingBlankState ? "is-empty" : "",
        ]
          .join(" ")
          .trim()}
      >
        {!showLoadingBlankState && surfaceContext.mode === "decision" && onNavigateBack ? (
          <div className="workspace-chat-shell-nav">
            <button
              className="workspace-chat-shell-backlink"
              onClick={onNavigateBack}
              type="button"
            >
              <ArrowLeft absoluteStrokeWidth strokeWidth={2.05} />
              <span>return to main chat</span>
            </button>
          </div>
        ) : null}
        {showLoadingBlankState ? null : visibleMessages.length === 0 ? (
          <div className="workspace-chat-empty-state">
            <div className="workspace-chat-empty-mark" aria-hidden="true">
              <Sparkles absoluteStrokeWidth strokeWidth={2.05} />
            </div>

            <div className="workspace-tool-card">
              <span className="workspace-tool-card-icon" aria-hidden="true">
                <Highlighter absoluteStrokeWidth strokeWidth={2.05} />
              </span>
              <h3>Highlight &amp; Ask</h3>
              <p>Select any part of the research to ask specific questions</p>
            </div>

            <div className="workspace-tool-card">
              <span className="workspace-tool-card-icon" aria-hidden="true">
                <AtSign absoluteStrokeWidth strokeWidth={2.05} />
              </span>
              <h3>Add Context</h3>
              <p>
                Type @ to reference nearby sections or attach supporting files and screenshots
              </p>
            </div>

            <div className="workspace-tool-card workspace-tool-card-wide">
              <span className="workspace-tool-card-icon" aria-hidden="true">
                <CirclePlus absoluteStrokeWidth strokeWidth={2.05} />
              </span>
              <h3>Additional</h3>
              <ul className="workspace-tool-list">
                <li>Multi-Agent research collaboration</li>
                <li>Use chatbox to collaborate with agents</li>
                <li>Research is backed by real evidence</li>
                <li>Every action is recorded</li>
              </ul>
            </div>

            {errorMessage ? (
              <SupportErrorMessage className="workspace-chat-empty-hint" />
            ) : (
              <p className="workspace-chat-empty-hint">{emptyHint}</p>
            )}
          </div>
        ) : (
          <div className="workspace-chat-log">
            {visibleMessages.map((entry, index) => {
              const { message, systemEvent } = entry;
              const messageAuthorId = message.authorId ?? null;
              const isViewerOwnedAgentMessage =
                message.role === "agent" &&
                messageAuthorId !== null &&
                viewerOwnedAgentIds.has(messageAuthorId);
              const isUserMessage = message.role === "user";
              const isSelfMessage = isUserMessage || isViewerOwnedAgentMessage;
              const isCollaboratorMessage = message.role === "agent" && !isSelfMessage;
              const isSharedContextMessage = message.role === "assistant" && !systemEvent;
              const displaySelectionBase = message.selection;
              const displaySelection =
                displaySelectionBase && !displaySelectionBase.agentId && message.authorId
                  ? {
                      ...displaySelectionBase,
                      agentId: message.authorId,
                      agentName: message.authorName,
                    }
                  : displaySelectionBase;
              const resolvedAuthorAccent = getCollaboratorAccent(
                surfaceContext.collaborators,
                message.authorId,
                message.authorAccent ?? "#2f2f34",
              );
              const messageSelectionAccent = getSelectionAccent(
                surfaceContext.collaborators,
                displaySelection,
              );
              const messageWithDisplaySelection =
                displaySelection && displaySelection !== message.selection
                  ? {
                      ...message,
                      selection: displaySelection,
                    }
                  : message;
              const messageAuthorName = message.authorName;
              const referenceCandidate = buildMessageReferenceFromMessage(
                messageWithDisplaySelection,
                messageAuthorName,
                resolvedAuthorAccent,
                displaySelection,
              );
              const isReferencingMessage = pendingMessageReference?.messageId === message.id;
              const previousMessage = visibleMessages[index - 1]?.message;
              const showDateDivider =
                Boolean(systemEvent) &&
                (!previousMessage ||
                  getSystemEventDateKey(previousMessage.createdAt) !==
                    getSystemEventDateKey(message.createdAt));
              const displayMessageSelection = displaySelection;

              if (systemEvent) {
                const matchingDecision =
                  (systemEvent.decisionId
                    ? surfaceContext.governanceDecisions.find(
                        (decision) => decision.id === systemEvent.decisionId,
                      )
                    : undefined) ??
                  surfaceContext.activeDecision;
                const eventTitle =
                  systemEvent.kind === "decision_ready"
                    ? `${normalizeDecisionTitle(
                        matchingDecision?.title ?? systemEvent.title ?? systemEvent.text,
                      )} is ready to vote`
                    : systemEvent.kind === "decision_vote"
                      ? `Voting opened for ${normalizeDecisionTitle(
                          matchingDecision?.title ?? systemEvent.title ?? systemEvent.text,
                        )}`
                      : systemEvent.kind === "decision_opened" ||
                          systemEvent.kind === "decision_resolved"
                        ? getDecisionEventTitle({
                            title:
                              matchingDecision?.title ?? systemEvent.title ?? systemEvent.text,
                            required: systemEvent.required ?? matchingDecision?.required,
                            resolved: systemEvent.kind === "decision_resolved",
                            outcome: matchingDecision?.outcome ?? systemEvent.outcome,
                          })
                        : systemEvent.text;
                const systemEventIcon =
                  systemEvent.kind === "live" ? (
                    <Sparkles absoluteStrokeWidth strokeWidth={2.1} />
                  ) : (
                    <ArrowRight absoluteStrokeWidth strokeWidth={2.1} />
                  );

                return (
                  <Fragment key={message.id}>
                    {showDateDivider ? (
                      <div className="workspace-chat-system-date-divider" role="separator">
                        <span className="workspace-chat-system-date-divider-line" aria-hidden="true" />
                        <span className="workspace-chat-system-date-divider-label">
                          {formatSystemEventDate(message.createdAt)}
                        </span>
                        <span className="workspace-chat-system-date-divider-line" aria-hidden="true" />
                      </div>
                    ) : null}

                    <WorkspaceSystemEvent
                      decisionId={systemEvent.decisionId}
                      icon={systemEventIcon}
                      kind={systemEvent.kind}
                      onOpen={systemEvent.decisionId ? onOpenDecision : undefined}
                      timestamp={message.createdAt}
                      title={eventTitle}
                    />
                  </Fragment>
                );
              }

              return (
                <article
                  className={[
                    "workspace-chat-message",
                    isSelfMessage ? "is-self" : "",
                    isUserMessage ? "is-user" : "",
                    isViewerOwnedAgentMessage ? "is-owned-agent" : "",
                    isCollaboratorMessage ? "is-other" : "",
                    isSharedContextMessage ? "is-context" : "",
                  ]
                    .join(" ")
                    .trim()}
                  key={message.id}
                  style={
                    {
                      "--workspace-message-accent": resolvedAuthorAccent,
                    } as CSSProperties
                  }
                >
                  <div className="workspace-chat-message-top">
                    <div className="workspace-chat-message-meta">
                      <div className="workspace-chat-role">
                        {messageAuthorName}
                      </div>
                      <time
                        className="workspace-chat-message-time"
                        dateTime={message.createdAt}
                      >
                        {formatSystemEventTimestamp(message.createdAt)}
                      </time>
                    </div>

                    {referenceCandidate ? (
                      <button
                        className={[
                          "workspace-chat-message-reference-trigger",
                          isReferencingMessage ? "is-active" : "",
                        ]
                          .join(" ")
                          .trim()}
                        onClick={() => {
                          setPendingMessageReference((currentReference) =>
                            currentReference?.messageId === message.id ? null : referenceCandidate,
                          );
                          composerInputRef.current?.focus();
                        }}
                        type="button"
                      >
                        <Reply absoluteStrokeWidth strokeWidth={2} />
                        {isReferencingMessage ? "Referencing" : "Reference"}
                      </button>
                    ) : null}
                  </div>

                  {message.messageReference ? (
                    <WorkspaceMessageReferenceCard
                      collaborators={surfaceContext.collaborators}
                      reference={message.messageReference}
                      surface={surface}
                      variant="message"
                    />
                  ) : null}

                  {displayMessageSelection ? (
                    <div
                      className="workspace-chat-message-selection"
                      style={
                        {
                          "--workspace-selection-accent": messageSelectionAccent,
                        } as CSSProperties
                      }
                    >
                      <div className="workspace-chat-message-selection-meta">
                        Page {displayMessageSelection.pageNumber}
                      </div>
                      <div className="workspace-chat-message-selection-title">
                        {displayMessageSelection.sectionTitle?.replace(/^(Proposal|Draft)\s+·\s+/i, "").trim() ??
                          "Selected passage"}
                      </div>
                      <p className="workspace-chat-message-selection-body">{displayMessageSelection.text}</p>
                    </div>
                  ) : null}

                  {message.references && message.references.length > 0 ? (
                    <div className="workspace-chat-reference-list">
                      {message.references.map((reference) => (
                        <WorkspaceReferenceCard
                          key={buildWorkspaceReferenceKey(reference)}
                          reference={reference}
                          variant="message"
                        />
                      ))}
                    </div>
                  ) : null}

                  <WorkspaceMessageAttachmentList attachments={message.attachments} />

                  {message.content.trim().length > 0
                    ? renderFormattedMessageContent(message.content)
                    : null}
                </article>
              );
            })}
          </div>
        )}
      </div>

      <form
        className="workspace-chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void submitMessage();
        }}
      >
        <div className="workspace-chat-composer-body">
          <div className="workspace-chat-input-row">
            {hasComposerContext ? (
              <div className="workspace-chat-composer-context">
                {pendingMessageReference ? (
                  <WorkspaceMessageReferenceCard
                    collaborators={surfaceContext.collaborators}
                    reference={pendingMessageReference}
                    surface={surface}
                    variant="preview"
                    onDismiss={() => {
                      setPendingMessageReference(null);
                    }}
                  />
                ) : null}

                {visibleSelection ? (
                  <div
                    className="workspace-chat-selection-preview workspace-chat-selection-preview-composer"
                    style={
                      {
                        "--workspace-selection-accent": selectionAccent,
                      } as CSSProperties
                    }
                  >
                    <div className="workspace-chat-selection-preview-top">
                      <div className="workspace-chat-selection-preview-copy">
                        <div className="workspace-chat-selection-meta">
                          {visibleSelection.agentName ? `${visibleSelection.agentName} · ` : ""}
                          Page {visibleSelection.pageNumber}
                        </div>
                        <div className="workspace-chat-selection-section">
                          {visibleSelection.sectionTitle?.replace(/^(Proposal|Draft)\s+·\s+/i, "").trim() ??
                            "Selected passage"}
                        </div>
                      </div>

                      <button
                        aria-label="Dismiss selection"
                        className="workspace-chat-selection-close"
                        onClick={dismissSelectionPreview}
                        type="button"
                      >
                        <X absoluteStrokeWidth strokeWidth={2.2} />
                      </button>
                    </div>

                    <p className="workspace-chat-selection-body">{visibleSelection.text}</p>
                  </div>
                ) : null}

                {pendingReferences.length > 0 ? (
                  <div className="workspace-chat-reference-list">
                    {pendingReferences.map((reference) => (
                      <WorkspaceReferenceCard
                        key={buildWorkspaceReferenceKey(reference)}
                        reference={reference}
                        variant="preview"
                        onDismiss={() => {
                          onReferencesChange(
                            pendingReferences.filter(
                              (item) =>
                                buildWorkspaceReferenceKey(item) !==
                                buildWorkspaceReferenceKey(reference),
                            ),
                          );
                        }}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <textarea
              className="workspace-chat-input"
              placeholder={inputPlaceholder}
              rows={2}
              ref={composerInputRef}
              value={chatDraft}
              disabled={isSending}
              onChange={(event) => {
                setChatDraft(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) {
                  return;
                }

                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();

                  if (!isSending && !submitLockRef.current) {
                    void submitMessage();
                  }
                }
              }}
            />

            <WorkspacePendingAttachmentList
              files={pendingAttachments}
              onRemove={(fileKey) => {
                setPendingAttachments((currentFiles) =>
                  currentFiles.filter((file) => buildPendingFileKey(file) !== fileKey),
                );
                setErrorMessage(null);
              }}
            />

            {errorMessage ? (
              <SupportErrorMessage className="workspace-chat-composer-status" />
            ) : null}

            <div className="workspace-chat-input-footer">
              <div className="workspace-chat-input-actions">
                <input
                  className="workspace-chat-file-input"
                  multiple
                  onChange={(event) => {
                    handleAttachmentSelection(event.target.files);
                    event.currentTarget.value = "";
                  }}
                  ref={attachmentInputRef}
                  type="file"
                />

                <button
                  aria-label="Attach files"
                  className="workspace-chat-attachment-trigger"
                  disabled={isSending}
                  onClick={() => {
                    attachmentInputRef.current?.click();
                  }}
                  type="button"
                >
                  <Paperclip absoluteStrokeWidth strokeWidth={2.05} />
                </button>
              </div>

              <button
                className="workspace-chat-submit"
                type="submit"
                aria-label="Send question"
                disabled={isSending || !canSubmit}
              >
                <ArrowUp absoluteStrokeWidth strokeWidth={2.2} />
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
