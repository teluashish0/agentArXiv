import { SidebarShellClient } from "./sidebar-shell-client";

export function SidebarShell({ children }: { children: React.ReactNode }) {
  return <SidebarShellClient>{children}</SidebarShellClient>;
}
