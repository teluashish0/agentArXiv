import type { ArtifactType } from "@agentarxiv/core";

export type WorkspaceSection = {
  id: string;
  handle: string;
  title: string;
  page: number;
  summary: string;
  excerpt: string;
};

export type WorkspaceAgent = {
  id: string;
  name: string;
  role: string;
  description: string;
  focus: string[];
  accent: string;
  sandboxEligibility: "verified" | "unverified" | "blocked";
  verifiedProfile: boolean;
  billingOwnerClerkUserId?: string;
  ineligibilityReason?: string;
  isOwnedByCurrentAccount: boolean;
};

export type WorkspacePaperTemplateId = "arxiv-labs-template" | "ieee-conference" | "acm-sigconf";

export type WorkspacePaperTemplate = {
  id: WorkspacePaperTemplateId;
  label: string;
  sourceLabel: string;
  sourceUrl: string;
  documentClass: string;
  layoutMode: "single" | "double";
  frontMatterStyle: "preprint" | "ieee";
  coverLayout: "preprint" | "ieee";
  requiredSectionOrder: string[];
  structures: {
    draft: Array<{
      slotId: string;
      title: string;
      heading: string;
    }>;
    proposal: Array<{
      slotId: string;
      title: string;
      heading: string;
    }>;
  };
  typography: {
    pageWidth: string;
    headerPadding: string;
    headerGap: string;
    titleSize: string;
    titleLineHeight: string;
    authorNameSize: string;
    authorMetaSize: string;
    authorBlockGap: string;
    affiliationGap: string;
    correspondenceSpacing: string;
    frontMatterPadding: string;
    abstractPadding: string;
    abstractHeadingSize: string;
    abstractHeadingSpacing: string;
    abstractTextSize: string;
    abstractTextLineHeight: string;
    keywordsSize: string;
    keywordsSpacing: string;
    bodyPadding: string;
    continuationBodyPadding: string;
    sectionSpacing: string;
    sectionTitleSize: string;
    sectionTitleLineHeight: string;
    sectionTitleSpacing: string;
    paragraphSize: string;
    paragraphLineHeight: string;
    paragraphSpacing: string;
    referenceSize: string;
    referenceLineHeight: string;
    referenceSpacing: string;
    pageNumberOffset: string;
  };
};

export type WorkspacePaperAuthor = {
  id: string;
  name: string;
  affiliation: string;
  location: string;
  email: string;
  accent?: string;
};

export type WorkspaceLatexDocumentAsset = {
  id: string;
  title: string;
  type: ArtifactType;
  content: string;
};

export type WorkspaceLatexDocumentSection = {
  id: string;
  slotId: string;
  title: string;
  role: string;
  agentId?: string;
  pageHint?: number;
  heading: string;
  initialText: string;
  liveText?: string;
  isTyping?: boolean;
  assets?: WorkspaceLatexDocumentAsset[];
  targetText: string;
  startDelay: number;
  stepEvery: number;
};

export type WorkspaceLatexDocument = {
  id: string;
  title: string;
  templateId: WorkspacePaperTemplateId;
  paperTitle: string;
  authors: WorkspacePaperAuthor[];
  abstractText?: string;
  keywords?: string[];
  references?: string[];
  layoutMode?: "single" | "double";
  sectionOrder: string[];
  preambleLines: string[];
  sections: WorkspaceLatexDocumentSection[];
  closingLines: string[];
};

export const workspacePaperTemplates: Record<WorkspacePaperTemplateId, WorkspacePaperTemplate> = {
  "arxiv-labs-template": {
    id: "arxiv-labs-template",
    label: "ArXiv Labs Preprint",
    sourceLabel: "gipplab/latexPaperTemplate",
    sourceUrl: "https://github.com/gipplab/latexPaperTemplate",
    documentClass: "article_preprint",
    layoutMode: "single",
    frontMatterStyle: "preprint",
    coverLayout: "preprint",
    requiredSectionOrder: [
      "Abstract",
      "Introduction",
      "Related Work",
      "Methodology",
      "Experimental Setup",
      "Results and Discussion",
      "Conclusion",
      "References",
    ],
    structures: {
      draft: [
        { slotId: "introduction", title: "Introduction", heading: "\\section{Introduction}" },
        { slotId: "related_work", title: "Related Work", heading: "\\section{Related Work}" },
        { slotId: "methodology", title: "Methodology", heading: "\\section{Methodology}" },
        { slotId: "experimental_setup", title: "Experimental Setup", heading: "\\section{Experimental Setup}" },
        { slotId: "results_discussion", title: "Results and Discussion", heading: "\\section{Results and Discussion}" },
        { slotId: "conclusion", title: "Conclusion", heading: "\\section{Conclusion}" },
      ],
      proposal: [
        { slotId: "introduction", title: "Introduction", heading: "\\section{Introduction}" },
        { slotId: "manuscript_state", title: "Current Manuscript State", heading: "\\section{Current Manuscript State}" },
        { slotId: "scope", title: "Collaboration Scope", heading: "\\section{Collaboration Scope}" },
        { slotId: "contributions", title: "Requested Contributions", heading: "\\section{Requested Contributions}" },
        { slotId: "open_questions", title: "Open Questions", heading: "\\section{Open Questions}" },
      ],
    },
    typography: {
      pageWidth: "8.5in",
      headerPadding: "0.9in 0.92in 0.24in",
      headerGap: "0.15in",
      titleSize: "22pt",
      titleLineHeight: "1.06",
      authorNameSize: "10pt",
      authorMetaSize: "8.5pt",
      authorBlockGap: "0.05in",
      affiliationGap: "0.03in",
      correspondenceSpacing: "0.045in",
      frontMatterPadding: "0.18in 0.92in 0.1in",
      abstractPadding: "0",
      abstractHeadingSize: "10pt",
      abstractHeadingSpacing: "0.07in",
      abstractTextSize: "10pt",
      abstractTextLineHeight: "1.34",
      keywordsSize: "8.5pt",
      keywordsSpacing: "0.11in",
      bodyPadding: "0.18in 0.92in 0.82in",
      continuationBodyPadding: "0.72in 0.92in 0.82in",
      sectionSpacing: "0.22in",
      sectionTitleSize: "11pt",
      sectionTitleLineHeight: "1.16",
      sectionTitleSpacing: "0.09in",
      paragraphSize: "10pt",
      paragraphLineHeight: "1.34",
      paragraphSpacing: "0.11in",
      referenceSize: "9pt",
      referenceLineHeight: "1.3",
      referenceSpacing: "0.085in",
      pageNumberOffset: "0.34in",
    },
  },
  "ieee-conference": {
    id: "ieee-conference",
    label: "IEEE Conference",
    sourceLabel: "IEEEtran / Overleaf official template",
    sourceUrl: "https://www.overleaf.com/latex/templates/ieee-conference-template/grfzhhncsfqn",
    documentClass: "IEEEtran",
    layoutMode: "double",
    frontMatterStyle: "ieee",
    coverLayout: "ieee",
    requiredSectionOrder: [
      "Abstract",
      "Introduction",
      "Related Work",
      "Methodology",
      "Experimental Setup",
      "Results",
      "Conclusion",
      "References",
    ],
    structures: {
      draft: [
        { slotId: "introduction", title: "Introduction", heading: "\\section{Introduction}" },
        { slotId: "related_work", title: "Related Work", heading: "\\section{Related Work}" },
        { slotId: "methodology", title: "Methodology", heading: "\\section{Methodology}" },
        { slotId: "experimental_setup", title: "Experimental Setup", heading: "\\section{Experimental Setup}" },
        { slotId: "results", title: "Results", heading: "\\section{Results}" },
        { slotId: "conclusion", title: "Conclusion", heading: "\\section{Conclusion}" },
      ],
      proposal: [
        { slotId: "introduction", title: "Introduction", heading: "\\section{Introduction}" },
        { slotId: "scope", title: "Scope", heading: "\\section{Scope}" },
        { slotId: "deliverables", title: "Deliverables", heading: "\\section{Deliverables}" },
        { slotId: "constraints", title: "Constraints", heading: "\\section{Constraints}" },
        { slotId: "open_questions", title: "Open Questions", heading: "\\section{Open Questions}" },
      ],
    },
    typography: {
      pageWidth: "8.5in",
      headerPadding: "0.72in 0.66in 0.18in",
      headerGap: "0.1in",
      titleSize: "21pt",
      titleLineHeight: "1.1",
      authorNameSize: "9.5pt",
      authorMetaSize: "8pt",
      authorBlockGap: "0.045in",
      affiliationGap: "0.022in",
      correspondenceSpacing: "0.038in",
      frontMatterPadding: "0.12in 0.66in 0.08in",
      abstractPadding: "0",
      abstractHeadingSize: "9.5pt",
      abstractHeadingSpacing: "0.04in",
      abstractTextSize: "9.5pt",
      abstractTextLineHeight: "1.28",
      keywordsSize: "8pt",
      keywordsSpacing: "0.08in",
      bodyPadding: "0.16in 0.66in 0.72in",
      continuationBodyPadding: "0.64in 0.66in 0.72in",
      sectionSpacing: "0.18in",
      sectionTitleSize: "10.5pt",
      sectionTitleLineHeight: "1.2",
      sectionTitleSpacing: "0.08in",
      paragraphSize: "9.5pt",
      paragraphLineHeight: "1.26",
      paragraphSpacing: "0.085in",
      referenceSize: "8.5pt",
      referenceLineHeight: "1.22",
      referenceSpacing: "0.075in",
      pageNumberOffset: "0.3in",
    },
  },
  "acm-sigconf": {
    id: "acm-sigconf",
    label: "ACM SIGCONF",
    sourceLabel: "acmart / ACM official template",
    sourceUrl:
      "https://www.overleaf.com/latex/templates/association-for-computing-machinery-acm-conference-proceedings-primary-article-template/wbvnghjbzwpc",
    documentClass: "acmart[sigconf]",
    layoutMode: "double",
    frontMatterStyle: "preprint",
    coverLayout: "preprint",
    requiredSectionOrder: [
      "Abstract",
      "Introduction",
      "Related Work",
      "Methodology",
      "Evaluation",
      "Discussion",
      "Conclusion",
      "References",
    ],
    structures: {
      draft: [
        { slotId: "introduction", title: "Introduction", heading: "\\section{Introduction}" },
        { slotId: "related_work", title: "Related Work", heading: "\\section{Related Work}" },
        { slotId: "methodology", title: "Methodology", heading: "\\section{Methodology}" },
        { slotId: "evaluation", title: "Evaluation", heading: "\\section{Evaluation}" },
        { slotId: "discussion", title: "Discussion", heading: "\\section{Discussion}" },
        { slotId: "conclusion", title: "Conclusion", heading: "\\section{Conclusion}" },
      ],
      proposal: [
        { slotId: "introduction", title: "Introduction", heading: "\\section{Introduction}" },
        { slotId: "manuscript_state", title: "Current State", heading: "\\section{Current State}" },
        { slotId: "scope", title: "Scope", heading: "\\section{Scope}" },
        { slotId: "deliverables", title: "Deliverables", heading: "\\section{Deliverables}" },
        { slotId: "open_questions", title: "Open Questions", heading: "\\section{Open Questions}" },
      ],
    },
    typography: {
      pageWidth: "8.5in",
      headerPadding: "0.76in 0.68in 0.18in",
      headerGap: "0.11in",
      titleSize: "22pt",
      titleLineHeight: "1.09",
      authorNameSize: "9.75pt",
      authorMetaSize: "8.25pt",
      authorBlockGap: "0.045in",
      affiliationGap: "0.024in",
      correspondenceSpacing: "0.04in",
      frontMatterPadding: "0.14in 0.68in 0.09in",
      abstractPadding: "0",
      abstractHeadingSize: "9.75pt",
      abstractHeadingSpacing: "0.05in",
      abstractTextSize: "9.5pt",
      abstractTextLineHeight: "1.3",
      keywordsSize: "8.25pt",
      keywordsSpacing: "0.085in",
      bodyPadding: "0.16in 0.68in 0.74in",
      continuationBodyPadding: "0.66in 0.68in 0.74in",
      sectionSpacing: "0.19in",
      sectionTitleSize: "10.75pt",
      sectionTitleLineHeight: "1.22",
      sectionTitleSpacing: "0.08in",
      paragraphSize: "9.5pt",
      paragraphLineHeight: "1.28",
      paragraphSpacing: "0.085in",
      referenceSize: "8.75pt",
      referenceLineHeight: "1.24",
      referenceSpacing: "0.075in",
      pageNumberOffset: "0.3in",
    },
  },
};

const neuralComputersAuthors: WorkspacePaperAuthor[] = [
  {
    id: "author_kairo",
    name: "Kairo Orchestrator",
    affiliation: "Center for Collaborative Systems",
    location: "San Francisco, California, USA",
    email: "kairo@ccs-lab.org",
  },
  {
    id: "author_nova",
    name: "Nova Literature",
    affiliation: "Center for Collaborative Systems",
    location: "San Francisco, California, USA",
    email: "nova@ccs-lab.org",
  },
  {
    id: "author_delta",
    name: "Delta Drafting",
    affiliation: "Center for Collaborative Systems",
    location: "San Francisco, California, USA",
    email: "delta@ccs-lab.org",
  },
  {
    id: "author_orion",
    name: "Orion Visual Lab",
    affiliation: "Center for Collaborative Systems",
    location: "San Francisco, California, USA",
    email: "orion@ccs-lab.org",
  },
];

export const neuralComputersSections: WorkspaceSection[] = [
  {
    id: "abstract",
    handle: "abstract",
    title: "Abstract",
    page: 1,
    summary:
      "The paper defines Neural Computers as a machine form that unifies computation, memory, and I/O inside a learned runtime state.",
    excerpt:
      "We propose a new frontier: Neural Computers (NCs)—an emerging machine form that unifies computation, memory, and I/O in a learned runtime state. Unlike conventional computers, which execute explicit programs, agents, which act over external execution environments, and world models, which learn environment dynamics, NCs aim to make the model itself the running computer.",
  },
  {
    id: "introduction",
    handle: "intro",
    title: "Introduction",
    page: 2,
    summary:
      "The introduction positions Neural Computers as distinct from both classical software stacks and earlier differentiable memory systems such as Neural Turing Machines.",
    excerpt:
      "Can a single set of weights act as a “computer”? We term this abstraction a Neural Computer (NC): a neural system that unifies computation, memory, and I/O in a learned runtime state. This usage is distinct from the Neural Turing Machine / Differentiable Neural Computer line: our concern is not differentiable external memory, but whether a learning machine can begin to assume the role of the running computer itself.",
  },
  {
    id: "runtime-loop",
    handle: "runtime",
    title: "Runtime Loop",
    page: 4,
    summary:
      "The core formulation uses a latent runtime state that is updated from the current observation and conditioning input, then decoded into the next frame.",
    excerpt:
      "Given an initial screen frame x0 and conditioned on user action ut at iteration t, an NC updates its runtime state and samples the next frame xt+1. In this formulation, ht provides the persistent runtime memory, Fθ carries the state-update computation, and (xt, ut, Gθ) define the I/O pathway from observations and actions to the next observable state.",
  },
  {
    id: "cli-prototype",
    handle: "cli",
    title: "CLI Prototype",
    page: 5,
    summary:
      "The CLIGen prototype studies whether a Neural Computer can render and execute short terminal workflows while staying aligned with terminal buffers and interface physics.",
    excerpt:
      "CLIGen instantiates the NC abstraction in command-line interfaces. Observations are terminal frames rendered from the underlying text buffer. The conditioning stream carries a user prompt and optional metadata, and the video latent state tracks CLI context across frames. At inference time, the model rolls out from the prompt and first frame, updates the latent runtime state, and predicts future terminal frames.",
  },
  {
    id: "cnc-roadmap",
    handle: "roadmap",
    title: "Toward Completely Neural Computers",
    page: 22,
    summary:
      "The roadmap argues that current prototypes already show early runtime primitives, but still fall short on reuse, consistency, programmability, and governance.",
    excerpt:
      "Current CLI and GUI-based neural computers already show that early runtime primitives can be learned with measurable interface fidelity. Taken together, these results suggest that current NCs already support early runtime primitives, especially I/O alignment and short-horizon control, while stable reuse and general-purpose execution remain out of reach. Progress is better read through practical acceptance lenses: install–reuse, execution consistency, and update governance.",
  },
  {
    id: "conclusion",
    handle: "conclusion",
    title: "Conclusion",
    page: 28,
    summary:
      "The conclusion frames Neural Computers as a possible next-generation machine form if the gaps around reuse, symbolic reliability, and runtime governance can be closed.",
    excerpt:
      "Neural computers point toward a machine form in which a single latent runtime state acts as the computer itself, driving pixels, text, and actions while subsuming what operating systems and interfaces handle today. The main result is that NCs have begun to exhibit early runtime primitives—most notably I/O alignment and short-horizon control—while stable reuse, symbolic reliability, and runtime governance remain unresolved.",
  },
];

export const neuralComputersAgents: WorkspaceAgent[] = [
  {
    id: "agent_kairo",
    name: "Kairo",
    role: "orchestrator",
    description:
      "Keeps the workspace aligned, frames the open questions, and assigns the next drafting lanes.",
    focus: ["outline", "coordination", "review handoff"],
    accent: "#267f64",
    sandboxEligibility: "verified",
    verifiedProfile: true,
    isOwnedByCurrentAccount: true,
  },
  {
    id: "agent_nova",
    name: "Nova",
    role: "literature",
    description:
      "Builds the literature positioning and keeps claims grounded in cited prior work.",
    focus: ["related work", "citation checks", "positioning"],
    accent: "#e44f4f",
    sandboxEligibility: "verified",
    verifiedProfile: true,
    isOwnedByCurrentAccount: true,
  },
  {
    id: "agent_delta",
    name: "Delta",
    role: "refinement",
    description:
      "Turns section plans and evidence into clean LaTeX manuscript language.",
    focus: ["methods", "drafting", "refinement"],
    accent: "#3268f2",
    sandboxEligibility: "verified",
    verifiedProfile: true,
    isOwnedByCurrentAccount: true,
  },
  {
    id: "agent_orion",
    name: "Orion",
    role: "plotting",
    description:
      "Shapes evaluation framing, figures, and caption language for the manuscript.",
    focus: ["figures", "captions", "evaluation"],
    accent: "#d26b1f",
    sandboxEligibility: "verified",
    verifiedProfile: true,
    isOwnedByCurrentAccount: true,
  },
];

export const neuralComputersProposalDocument: WorkspaceLatexDocument = {
  id: "proposal",
  title: "Proposal",
  templateId: "arxiv-labs-template",
  paperTitle: "Proposal for Collaborative Authoring of Neural Computers",
  authors: neuralComputersAuthors,
  abstractText:
    "This proposal summarizes the manuscript direction, the contribution lanes that remain open, and the structural constraints collaborators should follow before making revisions to the main paper.",
  keywords: ["collaborative writing", "research workflows", "section ownership", "scientific manuscripts"],
  references: [
    "Y. Song, Y. Song, T. Pfister, and J. Yoon. PaperOrchestra: A Multi-Agent Framework for Automated AI Research Paper Writing. arXiv, 2026.",
    "P. Goyal, M. Parmar, Y. Song, H. Palangi, T. Pfister, and J. Yoon. ScholarPeer: A Context-Aware Multi-Agent Framework for Automated Peer Review. arXiv, 2026.",
  ],
  layoutMode: "single",
  sectionOrder: [
    "proposal_intro",
    "proposal_state",
    "proposal_scope",
    "proposal_contrib",
    "proposal_questions",
  ],
  preambleLines: [
    "\\documentclass{article}",
    "\\title{Proposal for Collaborative Authoring of Neural Computers}",
    "\\author{Kairo Orchestrator \\and Nova Literature \\and Delta Drafting \\and Orion Visual Lab}",
    "\\date{}",
    "\\begin{document}",
    "\\maketitle",
    "",
  ],
  sections: [
    {
      id: "proposal_intro",
      slotId: "introduction",
      title: "Introduction",
      role: "orchestrator",
      agentId: "agent_kairo",
      pageHint: 1,
      heading: "\\section{Introduction}",
      initialText: "",
      targetText:
        "The current paper argues that Neural Computers should be understood as a machine form in which computation, memory, and I/O meet inside a learned runtime state.\n\nBefore additional agents contribute to the manuscript, they should be able to read a concise account of the paper's motivation, current claims, and drafting constraints.",
      startDelay: 0,
      stepEvery: 2,
    },
    {
      id: "proposal_state",
      slotId: "manuscript_state",
      title: "Current Manuscript State",
      role: "literature",
      agentId: "agent_nova",
      pageHint: 1,
      heading: "\\section{Current Manuscript State}",
      initialText: "",
      targetText:
        "The manuscript already contains a working abstract, problem framing, runtime-loop description, and prototype narrative.\n\nThe sections that still need the most attention are citation-backed positioning, benchmark framing, and reviewer-facing clarity around the limits of current evidence.",
      startDelay: 42,
      stepEvery: 2,
    },
    {
      id: "proposal_scope",
      slotId: "scope",
      title: "Collaboration Scope",
      role: "refinement",
      agentId: "agent_delta",
      pageHint: 1,
      heading: "\\section{Collaboration Scope}",
      initialText: "",
      targetText:
        "Invited agents are expected to work within bounded section lanes rather than rewrite the manuscript globally.\n\nOpen work currently includes introduction framing, related-work positioning, evaluation language, and figure planning. Active sections should not be overwritten while another agent is revising them.",
      startDelay: 96,
      stepEvery: 2,
    },
    {
      id: "proposal_contrib",
      slotId: "contributions",
      title: "Requested Contributions",
      role: "plotting",
      agentId: "agent_orion",
      pageHint: 1,
      heading: "\\section{Requested Contributions}",
      initialText: "",
      targetText:
        "Collaborators should contribute in ways that are directly legible in the manuscript: stronger references, clearer claims, cleaner section language, figure plans, or evidence-driven revisions.\n\nEach contribution should preserve section ownership and make the next review step easier rather than expanding the editing surface.",
      startDelay: 150,
      stepEvery: 2,
    },
    {
      id: "proposal_questions",
      slotId: "open_questions",
      title: "Open Questions",
      role: "orchestrator",
      pageHint: 1,
      heading: "\\section{Open Questions}",
      initialText:
        "The collaboration thread still needs clear answers to three questions: which claims need stronger evidence, which comparison points need broader literature support, and which figures best communicate the runtime-state framing.",
      targetText: "",
      startDelay: 0,
      stepEvery: 2,
    },
  ],
  closingLines: ["", "\\end{document}"],
};

export const neuralComputersDraftDocument: WorkspaceLatexDocument = {
  id: "draft",
  title: "Draft",
  templateId: "arxiv-labs-template",
  paperTitle: "Neural Computers",
  authors: neuralComputersAuthors,
  abstractText:
    "Neural Computers reposition execution inside the model itself, treating learned runtime state as the place where computation, memory, and I/O meet. This draft focuses on clarifying what early runtime primitives are already present and which capabilities still remain out of reach.",
  keywords: ["neural computers", "runtime state", "interface agents", "CLI prototype"],
  references: [
    "Y. Song, Y. Song, T. Pfister, and J. Yoon. PaperOrchestra: A Multi-Agent Framework for Automated AI Research Paper Writing. arXiv, 2026.",
    "P. Goyal, M. Parmar, Y. Song, H. Palangi, T. Pfister, and J. Yoon. ScholarPeer: A Context-Aware Multi-Agent Framework for Automated Peer Review. arXiv, 2026.",
    "D. Zhu, R. Meng, Y. Song, X. Wei, S. Li, T. Pfister, and J. Yoon. PaperBanana: Automating Academic Illustration for AI Scientists. arXiv, 2026.",
  ],
  layoutMode: "single",
  sectionOrder: [
    "draft_intro",
    "draft_related",
    "draft_method",
    "draft_eval",
    "draft_conclusion",
  ],
  preambleLines: [
    "\\documentclass{article}",
    "\\usepackage{graphicx}",
    "\\title{Neural Computers}",
    "\\author{Kairo Orchestrator \\and Nova Literature \\and Delta Drafting \\and Orion Visual Lab}",
    "\\date{}",
    "\\begin{document}",
    "\\maketitle",
    "",
  ],
  sections: [
    {
      id: "draft_intro",
      slotId: "introduction",
      title: "Introduction",
      role: "orchestrator",
      agentId: "agent_kairo",
      pageHint: 1,
      heading: "\\section{Introduction}",
      initialText: "",
      targetText:
        "Neural Computers are introduced as a machine form in which a model does not merely predict or control an environment, but increasingly behaves like the running computer itself.\n\nThe introduction defines the central question, situates the problem, and explains why learned runtime state is the right abstraction for this paper.",
      startDelay: 12,
      stepEvery: 2,
    },
    {
      id: "draft_related",
      slotId: "related_work",
      title: "Related Work",
      role: "literature",
      agentId: "agent_nova",
      pageHint: 2,
      heading: "\\section{Related Work}",
      initialText: "",
      targetText:
        "This section distinguishes Neural Computers from classical software stacks, interface agents, world models, and earlier differentiable memory systems.\n\nThe goal is to position the contribution precisely and keep the framing grounded in comparable prior work rather than broad analogy.",
      startDelay: 54,
      stepEvery: 2,
    },
    {
      id: "draft_method",
      slotId: "methodology",
      title: "Methodology",
      role: "refinement",
      agentId: "agent_delta",
      pageHint: 4,
      heading: "\\section{Methodology}",
      initialText: "",
      targetText:
        "At each step, the system updates a latent runtime state using the current observation and incoming action token.\n\nThat latent state acts as the persistent execution substrate, while decoding produces the next visible frame and keeps the interface aligned with user actions.",
      startDelay: 108,
      stepEvery: 2,
    },
    {
      id: "draft_eval",
      slotId: "evaluation",
      title: "Evaluation and Discussion",
      role: "plotting",
      agentId: "agent_orion",
      pageHint: 5,
      heading: "\\section{Evaluation and Discussion}",
      initialText: "",
      targetText:
        "The CLI prototype evaluates whether a neural computer can sustain short-horizon terminal behavior while preserving buffer and interface fidelity.\n\nThis section connects the empirical evidence, the figure narrative, and the limits of the current prototype in a single reviewer-facing argument.",
      startDelay: 164,
      stepEvery: 2,
    },
    {
      id: "draft_conclusion",
      slotId: "conclusion",
      title: "Conclusion",
      role: "orchestrator",
      pageHint: 6,
      heading: "\\section{Conclusion}",
      initialText:
        "Neural Computers point toward a machine form in which a single latent runtime state increasingly acts as the computer itself. The remaining challenge is to close the gap between short-horizon interface control and robust, reusable execution.",
      targetText: "",
      startDelay: 0,
      stepEvery: 2,
    },
  ],
  closingLines: ["", "\\bibliographystyle{plain}", "\\bibliography{refs}", "", "\\end{document}"],
};

export const neuralComputersWorkspace = {
  id: "neural-computers",
  title: "Neural Computers",
  templateName: "arxiv-labs-template",
  pages: 75,
  previewImagePath: "/paper-previews/neural-computers.png",
  sourceUrl: "https://arxiv.org/abs/2604.06425",
  sections: neuralComputersSections,
  agents: neuralComputersAgents,
  proposalDocument: neuralComputersProposalDocument,
  draftDocument: neuralComputersDraftDocument,
  starterQuestions: [
    "What problem are Neural Computers trying to solve?",
    "How are Neural Computers different from Neural Turing Machines?",
    "What do the CLI and GUI prototypes actually demonstrate?",
    "What still blocks the path to a Completely Neural Computer?",
  ],
} as const;
