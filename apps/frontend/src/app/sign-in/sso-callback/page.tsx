import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";
import { SidebarShell } from "../../sidebar-shell";

export default function SignInSsoCallbackPage() {
  return (
    <SidebarShell>
      <main className="auth-stage">
        <div className="auth-shell auth-callback-shell">
          <p className="auth-callback-copy">finishing your sign-in...</p>
          <AuthenticateWithRedirectCallback />
          <div id="clerk-captcha" />
        </div>
      </main>
    </SidebarShell>
  );
}
