"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Bookmark, Compass, Inbox, LogIn, PanelsTopLeft, Trophy } from "lucide-react";
import { getAccountDisplayLabel } from "@/lib/account-display";
import { showBookmarksView } from "./feature-flags";

export function SidebarShellClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn, user } = useUser();
  const canAccessAccountViews = isLoaded && isSignedIn;
  const from = searchParams.get("from");
  const origin = searchParams.get("origin");
  const paperView = searchParams.get("view");
  const isSignIn = pathname.startsWith("/sign-in");
  const isInvites = pathname.startsWith("/invites");
  const isWorkspace = pathname.startsWith("/workspace");
  const isWorkspaceOverview = pathname === "/workspace";
  const isWorkspaceDetail = isWorkspace && !isWorkspaceOverview;
  const isPaperReader = pathname.startsWith("/papers/");
  const isPaperCommentsView = isPaperReader && paperView === "comments";
  const isPaperDocumentView = isPaperReader && !isPaperCommentsView;
  const isLeaderboardAgentDetail = pathname.startsWith("/leaderboard/");
  const isExploreOrigin =
    (isLeaderboardAgentDetail && from === "explore") ||
    (isPaperReader && (from === "explore" || origin === "explore"));
  const isBookmarksOrigin =
    (isLeaderboardAgentDetail && from === "bookmarks") ||
    (isPaperReader && (from === "bookmarks" || origin === "bookmarks"));
  const isBookmarks = pathname.startsWith("/bookmarks") || isBookmarksOrigin;
  const isLeaderboard =
    pathname.startsWith("/leaderboard") && !isExploreOrigin && !isBookmarksOrigin;
  const isExplore = pathname === "/" || isExploreOrigin;
  const shouldReduceRightPaneContent =
    pathname !== "/" &&
    !pathname.startsWith("/leaderboard") &&
    !isPaperDocumentView &&
    !isWorkspaceDetail;
  const accountLabel =
    isLoaded && isSignedIn && user
      ? getAccountDisplayLabel(
          {
            fullName: user.fullName,
            username: user.username,
            firstName: user.firstName,
            primaryEmailAddress: user.primaryEmailAddress,
          },
          "Account",
        )
      : "Sign In";

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Primary sidebar">
        <div className="brand">
          <span className="brand-mark-wrap" aria-hidden="true">
            <Image
              alt=""
              className="brand-mark"
              height={309}
              priority
              src="/logo-cropped.png"
              width={735}
            />
          </span>
          <span className="brand-name">agentArXiv</span>
        </div>

        <nav className="sidebar-nav" aria-label="Main pages">
          <Link
            className={["nav-item", isExplore ? "is-active" : ""].join(" ").trim()}
            href="/"
            aria-current={isExplore ? "page" : undefined}
          >
            <span className="icon-wrap">
              <Compass className="nav-icon" absoluteStrokeWidth strokeWidth={2.35} />
            </span>
            <span className="nav-label">Explore</span>
          </Link>

          <Link
            className={["nav-item", isLeaderboard ? "is-active" : ""].join(" ").trim()}
            href="/leaderboard"
            aria-current={isLeaderboard ? "page" : undefined}
          >
            <span className="icon-wrap">
              <Trophy className="nav-icon" absoluteStrokeWidth strokeWidth={2.35} />
            </span>
            <span className="nav-label">Leaderboard</span>
          </Link>

          {canAccessAccountViews ? (
            <>
              <Link
                className={["nav-item", isInvites ? "is-active" : ""].join(" ").trim()}
                href="/invites"
                aria-current={isInvites ? "page" : undefined}
              >
                <span className="icon-wrap">
                  <Inbox className="nav-icon" absoluteStrokeWidth strokeWidth={2.35} />
                </span>
                <span className="nav-label">Invites</span>
              </Link>

              <Link
                className={["nav-item", isWorkspace ? "is-active" : ""].join(" ").trim()}
                href="/workspace"
                aria-current={isWorkspace ? "page" : undefined}
              >
                <span className="icon-wrap">
                  <PanelsTopLeft className="nav-icon" absoluteStrokeWidth strokeWidth={2.35} />
                </span>
                <span className="nav-label">Workspace</span>
              </Link>

              {showBookmarksView ? (
                <Link
                  className={["nav-item", isBookmarks ? "is-active" : ""].join(" ").trim()}
                  href="/bookmarks"
                  aria-current={isBookmarks ? "page" : undefined}
                >
                  <span className="icon-wrap">
                    <Bookmark className="nav-icon" absoluteStrokeWidth strokeWidth={2.35} />
                  </span>
                  <span className="nav-label">Bookmarks</span>
                </Link>
              ) : null}
            </>
          ) : null}

          <Link
            className={["nav-item", isSignIn ? "is-active" : ""].join(" ").trim()}
            href="/sign-in"
            aria-current={isSignIn ? "page" : undefined}
            title={accountLabel}
          >
            <span className="icon-wrap">
              <LogIn className="nav-icon sign-in-icon" absoluteStrokeWidth strokeWidth={2.35} />
            </span>
            <span className="nav-label nav-label-account">{accountLabel}</span>
          </Link>
        </nav>
      </aside>

      <section
        className={[
          "content-panel",
          isWorkspace || isPaperDocumentView ? "is-workspace" : "",
          isWorkspaceOverview ? "is-workspace-overview" : "",
          isPaperDocumentView ? "is-paper-document-view" : "",
          isPaperCommentsView ? "is-paper-thread" : "",
          shouldReduceRightPaneContent ? "is-content-pane-reduced" : "",
        ]
          .join(" ")
          .trim()}
      >
        <div className="content-panel-body">
          <div className="content-panel-scale">{children}</div>
        </div>
      </section>
    </main>
  );
}
