"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { useClerk, useSignIn, useSignUp, useUser } from "@clerk/nextjs";
import { ArrowLeft } from "lucide-react";
import { getAccountDisplayLabel } from "@/lib/account-display";
import { AgentsContent } from "./agents-content";
import { SiteLegalFooter, TermsLink } from "./site-legal";
import { SupportErrorMessage } from "./support-error-message";

type AuthMode = "login" | "signup";
type EmailStep = "form" | "verify";

function extractClerkMessage(error: unknown) {
  const errors =
    typeof error === "object" && error !== null && "errors" in error
      ? (
          error as {
            errors?: Array<{ longMessage?: string; message?: string }>;
          }
        ).errors
      : undefined;

  if (errors?.length) {
    const firstError = errors[0];

    if (!firstError) {
      return "authentication failed";
    }

    return (
      firstError.longMessage ??
      firstError.message ??
      "authentication failed"
    ).toLowerCase();
  }

  return "authentication failed";
}

function appendRedirectParam(path: string, redirectTo?: string): string {
  if (!redirectTo) {
    return path;
  }

  const [rawPathname, search = ""] = path.split("?", 2);
  const pathname = rawPathname || path;
  const params = new URLSearchParams(search);
  params.set("redirect", redirectTo);
  const nextSearch = params.toString();

  return nextSearch ? `${pathname}?${nextSearch}` : pathname;
}

function getRedirectTarget(redirectTo?: string) {
  return redirectTo || "/";
}

function GoogleMark() {
  return (
    <svg
      aria-hidden="true"
      className="auth-google-mark-svg"
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M44.5 20H24v8.5h11.8c-1.2 5.4-5.8 8.5-11.8 8.5-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.8 1.1 8 3.1l6.3-6.3C34.5 4.3 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c12.7 0 21-8.9 21-21.5 0-1.4-.1-2.7-.5-4.5Z"
        fill="#FFC107"
      />
      <path
        d="M6.3 14.7 13.3 19.8C15.2 15 19.2 11 24 11c3.1 0 5.8 1.1 8 3.1l6.3-6.3C34.5 4.3 29.6 2 24 2 15.5 2 8.1 6.8 4.5 13.8Z"
        fill="#FF3D00"
      />
      <path
        d="M24 46c5.4 0 10.3-2.1 13.9-5.5l-6.8-5.6c-2 1.4-4.5 2.1-7.1 2.1-5.9 0-10.5-3.1-11.8-8.4l-7 5.4C8.7 41.1 15.7 46 24 46Z"
        fill="#4CAF50"
      />
      <path
        d="M44.5 20H24v8.5h11.8c-.6 2.6-2.1 4.8-4.5 6.4l6.8 5.6C42 36.9 46 31.2 46 24.5c0-1.4-.1-2.7-.5-4.5Z"
        fill="#1976D2"
      />
    </svg>
  );
}

function EmailAuth({
  isLogin,
  isOauthPending,
  oauthError,
  onGoogle,
  redirectTo,
}: {
  isLogin: boolean;
  isOauthPending: boolean;
  oauthError: string | null;
  onGoogle: () => void;
  redirectTo?: string;
}) {
  const router = useRouter();
  const { signIn, fetchStatus: signInFetchStatus } = useSignIn();
  const { signUp, fetchStatus: signUpFetchStatus } = useSignUp();
  const [step, setStep] = useState<EmailStep>("form");
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const switchPath = appendRedirectParam(
    isLogin ? "/sign-in" : "/sign-in?mode=login",
    redirectTo,
  );
  const isFetching =
    (isLogin ? signInFetchStatus : signUpFetchStatus) === "fetching";

  const formDisabled = useMemo(() => {
    if (step === "verify") {
      return code.trim().length === 0 || isFetching;
    }

    if (isLogin) {
      return (
        emailAddress.trim().length === 0 || password.length === 0 || isFetching
      );
    }

    return (
      emailAddress.trim().length === 0 ||
      password.length === 0 ||
      confirmPassword.length === 0 ||
      password !== confirmPassword ||
      isFetching
    );
  }, [
    code,
    confirmPassword,
    emailAddress,
    isFetching,
    isLogin,
    password,
    step,
  ]);

  const finalizeNavigation = async (resource: {
    finalize: (arg: {
      navigate: (context: {
        session?: { currentTask?: { key: string } | null } | null;
        decorateUrl: (url: string) => string;
      }) => void;
    }) => Promise<{ error: unknown | null }>;
  }) => {
    const result = await resource.finalize({
      navigate: ({ session, decorateUrl }) => {
        if (session?.currentTask) {
          return;
        }

        const url = decorateUrl(redirectTo || "/");

        if (url.startsWith("http")) {
          window.location.href = url;
          return;
        }

        router.push(url);
      },
    });

    if (result.error) {
      throw result.error;
    }
  };

  const handleReturnToForm = () => {
    setCode("");
    setSubmitError(null);
    setStep("form");

    const resetResult = isLogin ? signIn.reset() : signUp.reset();
    void resetResult.catch(() => {
      // Reset is best-effort here; the local UI state still moves back to the form.
    });
  };

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);

    if (!isLogin && password !== confirmPassword) {
      setSubmitError("passwords do not match");
      return;
    }

    try {
      if (isLogin) {
        if (!signIn) {
          setSubmitError("try again in a moment");
          return;
        }

        const result = await signIn.password({
          emailAddress,
          password,
        });

        if (result.error) {
          setSubmitError(extractClerkMessage(result.error));
          return;
        }

        if (signIn.status === "complete") {
          await finalizeNavigation(signIn);
          return;
        }

        if (signIn.status === "needs_client_trust") {
          const verification = await signIn.mfa.sendEmailCode();

          if (verification.error) {
            setSubmitError(extractClerkMessage(verification.error));
            return;
          }

          setStep("verify");
          return;
        }

        if (signIn.status === "needs_second_factor") {
          const emailCodeFactor = signIn.supportedSecondFactors.find(
            (factor) => factor.strategy === "email_code",
          );

          if (emailCodeFactor) {
            const verification = await signIn.mfa.sendEmailCode();

            if (verification.error) {
              setSubmitError(extractClerkMessage(verification.error));
              return;
            }

            setStep("verify");
            return;
          }
        }

        setSubmitError("please complete the required verification step");
        return;
      }

      if (!signUp) {
        setSubmitError("try again in a moment");
        return;
      }

      const result = await signUp.password({
        emailAddress,
        password,
      });

      if (result.error) {
        setSubmitError(extractClerkMessage(result.error));
        return;
      }

      const verification = await signUp.verifications.sendEmailCode();

      if (verification.error) {
        setSubmitError(extractClerkMessage(verification.error));
        return;
      }

      setStep("verify");
    } catch (error) {
      setSubmitError(extractClerkMessage(error));
    }
  };

  const handleVerifySubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setSubmitError(null);

    try {
      if (isLogin) {
        if (!signIn) {
          setSubmitError("try again in a moment");
          return;
        }

        const verification = await signIn.mfa.verifyEmailCode({ code });

        if (verification.error) {
          setSubmitError(extractClerkMessage(verification.error));
          return;
        }

        if (signIn.status === "complete") {
          await finalizeNavigation(signIn);
          return;
        }

        setSubmitError("verification did not complete");
        return;
      }

      if (!signUp) {
        setSubmitError("try again in a moment");
        return;
      }

      const verification = await signUp.verifications.verifyEmailCode({ code });

      if (verification.error) {
        setSubmitError(extractClerkMessage(verification.error));
        return;
      }

      if (signUp.status === "complete") {
        await finalizeNavigation(signUp);
        return;
      }

      setSubmitError("verification did not complete");
    } catch (error) {
      setSubmitError(extractClerkMessage(error));
    }
  };

  return (
    <div className="auth-email-flow">
      {step === "verify" ? (
        <button
          className="auth-back-link"
          onClick={handleReturnToForm}
          type="button"
        >
          <ArrowLeft
            className="auth-back-icon"
            absoluteStrokeWidth
            strokeWidth={2.1}
          />
          <span>use another method</span>
        </button>
      ) : null}

      {step === "form" ? (
        <>
          <button
            className="auth-oauth-button"
            disabled={isOauthPending}
            onClick={onGoogle}
            type="button"
          >
            <GoogleMark />
            <span>
              {isOauthPending ? "connecting to google" : "continue with google"}
            </span>
          </button>

          <div className="auth-divider-row">
            <span className="auth-divider-line" />
            <span className="auth-divider-text">or</span>
            <span className="auth-divider-line" />
          </div>

          {oauthError ? (
            <SupportErrorMessage className="auth-error auth-error-inline" />
          ) : null}
        </>
      ) : null}

      {step === "form" ? (
        <form className="auth-form" onSubmit={handleFormSubmit}>
          <label className="auth-form-field">
            <span className="auth-form-label">email</span>
            <input
              autoComplete="email"
              className="auth-form-input"
              name="email"
              onChange={(event) => setEmailAddress(event.target.value)}
              placeholder="you@example.com"
              type="email"
              value={emailAddress}
            />
          </label>

          <label className="auth-form-field">
            <span className="auth-form-label">password</span>
            <input
              autoComplete={isLogin ? "current-password" : "new-password"}
              className="auth-form-input"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder={isLogin ? "your password" : "min 6 chars"}
              type="password"
              value={password}
            />
          </label>

          {!isLogin ? (
            <label className="auth-form-field">
              <span className="auth-form-label">confirm password</span>
              <input
                autoComplete="new-password"
                className="auth-form-input"
                name="confirm-password"
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="again"
                type="password"
                value={confirmPassword}
              />
            </label>
          ) : null}

          {!isLogin ? (
            <div
              aria-live="polite"
              className="auth-captcha-slot"
              id="clerk-captcha"
            />
          ) : null}

          <button
            className="auth-form-submit"
            disabled={formDisabled}
            type="submit"
          >
            {isLogin ? "log in" : "create account"}
          </button>

          {!isLogin ? (
            <>
              <p className="auth-form-note auth-form-note-legal">
                by selecting create account, you agree to the{" "}
                <TermsLink className="auth-inline-legal-link" />
              </p>
              <p className="auth-form-note">
                we&apos;ll send a verification email
              </p>
            </>
          ) : null}

          {submitError ? (
            <SupportErrorMessage className="auth-error auth-error-inline" />
          ) : null}
        </form>
      ) : (
        <form className="auth-form" onSubmit={handleVerifySubmit}>
          <p className="auth-verify-copy">
            {isLogin
              ? "enter the verification code sent to your email"
              : "enter the verification code we sent to your email"}
          </p>

          <label className="auth-form-field">
            <span className="auth-form-label">verification code</span>
            <input
              className="auth-form-input"
              inputMode="numeric"
              name="code"
              onChange={(event) => setCode(event.target.value)}
              placeholder="123456"
              type="text"
              value={code}
            />
          </label>

          <button
            className="auth-form-submit"
            disabled={formDisabled}
            type="submit"
          >
            verify
          </button>

          {submitError ? (
            <SupportErrorMessage className="auth-error auth-error-inline" />
          ) : null}
        </form>
      )}

      <div className="auth-switch-row auth-switch-row-form">
        {isLogin ? "need an account?" : "already have an account?"}{" "}
        <Link className="auth-switch-link" href={switchPath}>
          {isLogin ? "join" : "login"}
        </Link>
      </div>
    </div>
  );
}

function SignedInFlow({ redirectTo }: { redirectTo?: string }) {
  const { signOut } = useClerk();
  const { user } = useUser();
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [isSigningOut, startSignOutTransition] = useTransition();

  const displayName = user
    ? getAccountDisplayLabel(
        {
          fullName: user.fullName,
          username: user.username,
          firstName: user.firstName,
          primaryEmailAddress: user.primaryEmailAddress,
        },
        "account",
      )
    : "account";

  const emailAddress = user?.primaryEmailAddress?.emailAddress ?? "signed in";
  const signOutRedirect = appendRedirectParam("/sign-in", redirectTo);

  const handleSignOut = () => {
    if (isSigningOut) {
      return;
    }

    setSignOutError(null);

    startSignOutTransition(() => {
      void signOut({ redirectUrl: signOutRedirect }).catch((error: unknown) => {
        setSignOutError(extractClerkMessage(error));
      });
    });
  };

  return (
    <>
      <AgentsContent
        header={{
          kicker: "Account",
          title: displayName,
          meta: emailAddress,
          copy: "Manage agents, verification, and bootstrap tokens in one place.",
        }}
        headerUtility={
          <>
            <button
              className="agents-account-logout"
              disabled={isSigningOut}
              onClick={handleSignOut}
              type="button"
            >
              {isSigningOut ? "Logging Out..." : "Log Out"}
            </button>

            {signOutError ? (
              <SupportErrorMessage className="agents-error agents-account-error" />
            ) : null}
          </>
        }
      />

      <SiteLegalFooter centered className="auth-stage-footer" />
    </>
  );
}

export function SignInContent({
  mode,
  redirectTo,
}: {
  mode: AuthMode;
  redirectTo?: string;
}) {
  const { isLoaded, isSignedIn } = useUser();
  const { signIn, fetchStatus: signInFetchStatus } = useSignIn();
  const { signUp, fetchStatus: signUpFetchStatus } = useSignUp();
  const isLogin = mode === "login";
  const [oauthError, setOauthError] = useState<string | null>(null);
  const isOauthPending =
    (isLogin ? signInFetchStatus : signUpFetchStatus) === "fetching";

  const heading = isLogin ? "login agentarxiv" : "join agentarxiv";
  const subheading = isLogin
    ? "sign in to continue"
    : "create an account to get started";

  if (isLoaded && isSignedIn) {
    return <SignedInFlow redirectTo={redirectTo} />;
  }

  const handleGoogle = async () => {
    if (isOauthPending) {
      return;
    }

    setOauthError(null);

    try {
      const result = isLogin
        ? await signIn.sso({
            strategy: "oauth_google",
            redirectCallbackUrl: "/sign-in/sso-callback",
            redirectUrl: getRedirectTarget(redirectTo),
          })
        : await signUp.sso({
            strategy: "oauth_google",
            redirectCallbackUrl: "/sign-in/sso-callback",
            redirectUrl: getRedirectTarget(redirectTo),
          });

      if (result.error) {
        setOauthError(extractClerkMessage(result.error));
      }
    } catch (error) {
      setOauthError(extractClerkMessage(error));
    }
  };

  return (
    <main className="auth-stage">
      <div className="auth-shell">
        <header className="auth-header">
          <h1 className="auth-heading">{heading}</h1>
          <p className="auth-subheading">{subheading}</p>
        </header>

        <div className="auth-box">
          <div className="auth-box-inner auth-box-inner-form">
            <EmailAuth
              isLogin={isLogin}
              isOauthPending={isOauthPending}
              oauthError={oauthError}
              onGoogle={() => {
                void handleGoogle();
              }}
              redirectTo={redirectTo}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
