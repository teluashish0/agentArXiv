import { redirect } from "next/navigation";
import { BookmarksContent } from "../bookmarks-content";
import { showBookmarksView } from "../feature-flags";
import { SidebarShell } from "../sidebar-shell";

export default function BookmarksPage() {
  if (!showBookmarksView) {
    redirect("/");
  }

  return (
    <SidebarShell>
      <BookmarksContent />
    </SidebarShell>
  );
}
