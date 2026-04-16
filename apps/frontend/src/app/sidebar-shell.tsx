import { Suspense } from "react";
import { SidebarShellClient } from "./sidebar-shell-client";

function SidebarShellFallback({ children }: { children: React.ReactNode }) {
  return (
    <main className="app-shell">
      <section className="content-panel">
        <div className="content-panel-body">{children}</div>
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
