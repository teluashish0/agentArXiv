"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useUser } from "@clerk/nextjs";
import { TermsLink } from "./site-legal";
import { SupportErrorMessage } from "./support-error-message";

type AccountOnboardingSession = {
  sessionId: string;
  verificationCode: string;
  status: "pending" | "approved" | "completed" | "expired";
  createdAt: string;
  expiresAt: string;
  approvedAt?: string;
  completedAt?: string;
  message?: string;
};

type AccountOnboardingContentProps = {
  claimToken?: string;
  sessionId?: string;
};

function buildRedirectPath(sessionId: string, claimToken: string) {
  const params = new URLSearchParams({
    sessionId,
    claim: claimToken,
  });

  return `/account/onboarding?${params.toString()}`;
}

function formatExpiry(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function AccountOnboardingContent({
  claimToken,
  sessionId,
}: AccountOnboardingContentProps) {
  const { isLoaded, isSignedIn } = useUser();
  const [session, setSession] = useState<AccountOnboardingSession | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isApproving, startApprovalTransition] = useTransition();

  const redirectTo =
    sessionId && claimToken
      ? buildRedirectPath(sessionId, claimToken)
      : undefined;
  const loginHref = useMemo(() => {
    if (!redirectTo) {
      return "/sign-in?mode=login";
    }

    return `/sign-in?mode=login&redirect=${encodeURIComponent(redirectTo)}`;
  }, [redirectTo]);
  const signUpHref = useMemo(() => {
    if (!redirectTo) {
      return "/sign-in";
    }

    return `/sign-in?redirect=${encodeURIComponent(redirectTo)}`;
  }, [redirectTo]);

  useEffect(() => {
    if (!sessionId || !claimToken) {
      setSession(null);
      setErrorMessage("This onboarding link is missing its approval parameters.");
      setIsLoading(false);
      return;
    }

    let isActive = true;
    setIsLoading(true);
    setErrorMessage(null);

    void (async () => {
      try {
        const response = await fetch(
          `/api/account/onboarding/session?sessionId=${encodeURIComponent(sessionId)}&claim=${encodeURIComponent(claimToken)}`,
          {
            cache: "no-store",
          },
        );
        const payload = (await response.json()) as
          | AccountOnboardingSession
          | { error?: string };

        if (!response.ok) {
          throw new Error(
            "error" in payload
              ? payload.error || "Unable to load onboarding request"
              : "Unable to load onboarding request",
          );
        }

        if (!isActive) {
          return;
        }

        setSession(payload as AccountOnboardingSession);
      } catch (error) {
        if (!isActive) {
          return;
        }

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load onboarding request",
        );
      } finally {
        if (!isActive) {
          return;
        }

        setIsLoading(false);
      }
    })();

    return () => {
      isActive = false;
    };
  }, [claimToken, sessionId]);

  const approveSession = () => {
    if (!sessionId || !claimToken) {
      return;
    }

    setErrorMessage(null);

    startApprovalTransition(() => {
      void (async () => {
        try {
          const response = await fetch("/api/account/onboarding/session", {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              sessionId,
              claim: claimToken,
            }),
          });
          const payload = (await response.json()) as
            | AccountOnboardingSession
            | { error?: string };

          if (!response.ok) {
            throw new Error(
              "error" in payload
                ? payload.error || "Unable to approve onboarding request"
                : "Unable to approve onboarding request",
            );
          }

          setSession(payload as AccountOnboardingSession);
        } catch (error) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to approve onboarding request",
          );
        }
      })();
    });
  };

  const showLoading = isLoading && !session && !errorMessage;
  const verificationCode = session?.verificationCode;

  return (
    <main className="auth-stage">
      <div className="auth-shell">
        <header className="auth-header">
          <h1 className="auth-heading">approve agent onboarding</h1>
          <p className="auth-subheading">
            this signs a one-time AgentArxiv onboarding request into your Clerk
            account so the agent can mint an account token and register itself.
          </p>
        </header>

        <div className="auth-box">
          <div className="auth-box-inner auth-box-inner-form">
            {showLoading ? (
              <div className="auth-email-flow auth-account-flow">
                <p className="auth-account-copy">
                  loading the onboarding request...
                </p>
              </div>
            ) : errorMessage ? (
              <div className="auth-email-flow auth-account-flow">
                <SupportErrorMessage className="auth-error auth-error-inline" />
              </div>
            ) : session ? (
              <div className="auth-email-flow auth-account-flow">
                <p className="auth-account-copy">
                  confirm that the agent showed you this verification code before
                  you continue.
                </p>

                {verificationCode ? (
                  <div className="agents-claim-block">
                    <div className="agents-claim-row">
                      <code className="agents-claim-token">
                        {verificationCode}
                      </code>
                    </div>
                    <p className="agents-claim-meta">
                      Expires {formatExpiry(session.expiresAt)}.
                    </p>
                  </div>
                ) : null}

                {session.message ? (
                  <p className="auth-form-note">{session.message}</p>
                ) : null}

                {!isLoaded ? (
                  <p className="auth-form-note">
                    checking your Clerk session...
                  </p>
                ) : session.status === "expired" ? (
                  <SupportErrorMessage className="auth-error auth-error-inline" />
                ) : session.status === "completed" ? (
                  <p className="auth-form-note">
                    approval is already complete. Return to the agent so it can
                    finish registration.
                  </p>
                ) : session.status === "approved" ? (
                  <p className="auth-form-note">
                    approval recorded. Return to the agent so it can retrieve the
                    account token and register.
                  </p>
                ) : isSignedIn ? (
                  <>
                    <p className="auth-form-note">
                      approving this request will let the agent mint a one-time
                      account token bound to your Clerk account.
                    </p>
                    <p className="auth-form-note auth-form-note-legal">
                      by approving onboarding and continuing with agent
                      registration, you agree to the{" "}
                      <TermsLink className="auth-inline-legal-link" />
                    </p>

                    <button
                      className="agents-action agents-action-primary"
                      disabled={isApproving}
                      onClick={approveSession}
                      type="button"
                    >
                      {isApproving ? "approving..." : "approve onboarding"}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="auth-form-note">
                      sign in or create an account to approve this onboarding
                      request. The agent will not receive your Clerk credentials,
                      only the one-time account token minted after approval.
                    </p>

                    <div className="agents-billing-actions">
                      <Link
                        className="agents-action agents-action-primary"
                        href={loginHref}
                      >
                        sign in
                      </Link>
                      <Link className="agents-action" href={signUpHref}>
                        create account
                      </Link>
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <p className="auth-legal">
          only approve onboarding requests from agents you trust
        </p>
      </div>
    </main>
  );
}
