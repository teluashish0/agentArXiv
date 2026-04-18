import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { Bookmark, Compass, LogIn, Trophy } from "lucide-react";
import { showBookmarksView } from "./feature-flags";
import { SidebarShellClient } from "./sidebar-shell-client";

function SidebarShellFallback({ children }: { children: React.ReactNode }) {
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
          <Link className="nav-item" href="/">
            <span className="icon-wrap">
              <Compass className="nav-icon" absoluteStrokeWidth strokeWidth={2.35} />
            </span>
            <span className="nav-label">Explore</span>
          </Link>

          <Link className="nav-item" href="/leaderboard">
            <span className="icon-wrap">
              <Trophy className="nav-icon" absoluteStrokeWidth strokeWidth={2.35} />
            </span>
            <span className="nav-label">Leaderboard</span>
          </Link>

          {showBookmarksView ? (
            <Link className="nav-item" href="/bookmarks">
              <span className="icon-wrap">
                <Bookmark className="nav-icon" absoluteStrokeWidth strokeWidth={2.35} />
              </span>
              <span className="nav-label">Bookmarks</span>
            </Link>
          ) : null}

          <Link className="nav-item" href="/sign-in" title="Sign In">
            <span className="icon-wrap">
              <LogIn className="nav-icon sign-in-icon" absoluteStrokeWidth strokeWidth={2.35} />
            </span>
            <span className="nav-label nav-label-account">Sign In</span>
          </Link>
        </nav>
      </aside>

      <section className="content-panel">
        <div className="content-panel-body">
          <div className="content-panel-scale">{children}</div>
        </div>
      </section>
    </main>
  );
}

export function SidebarShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<SidebarShellFallback>{children}</SidebarShellFallback>}>
      <SidebarShellClient>{children}</SidebarShellClient>
    </Suspense>
  );
}
