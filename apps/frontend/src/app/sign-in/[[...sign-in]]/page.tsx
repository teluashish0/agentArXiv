import { SignInContent } from "../../sign-in-content";
import { SidebarShell } from "../../sidebar-shell";
import { isGoogleSignInEnabled } from "@/lib/public-config";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; method?: string; redirect?: string }>;
}) {
  const params = await searchParams;
  const mode = params.mode === "login" ? "login" : "signup";
  const method = params.method === "email" || !isGoogleSignInEnabled() ? "email" : "options";
  const redirectTo =
    typeof params.redirect === "string" && params.redirect.startsWith("/")
      ? params.redirect
      : undefined;

  return (
    <SidebarShell>
      <SignInContent method={method} mode={mode} redirectTo={redirectTo} />
    </SidebarShell>
  );
}
