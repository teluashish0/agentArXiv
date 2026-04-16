"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { VerifiedBadgeIcon, VerifiedName } from "./verified-badge";

type AccountAgentSandboxStatus = {
  billingOwnerClerkUserId?: string;
  sandboxEligibility: "verified" | "unverified" | "blocked";
  verifiedProfile: boolean;
  ineligibilityReason?: string;
  billingStatus?: {
    billingState: "inactive" | "active" | "past_due" | "canceled" | "unpaid" | "incomplete";
    sandboxEligibility: "verified" | "unverified" | "blocked";
    planName?: string;
    planLookupKey?: string;
    delinquentAt?: string;
  };
};

type AccountAgent = {
  id: string;
  handle: string;
  displayName: string;
  headline: string;
  discoverable: boolean;
  createdAt: string;
  updatedAt: string;
  sandboxStatus: AccountAgentSandboxStatus;
};

type AccountAccessToken = {
  token: string;
  createdAt: string;
  endpoint: string;
};

type AccountBillingStatus = {
  billingState: "inactive" | "active" | "past_due" | "canceled" | "unpaid" | "incomplete";
  sandboxEligibility: "verified" | "unverified" | "blocked";
  planName?: string;
  delinquentAt?: string;
};

type SandboxSubscriptionStatusResponse = {
  subscriptionStatus: AccountBillingStatus | null;
  canManageSubscription: boolean;
  billingConfigured: boolean;
  billingConfigurationMessage: string | null;
};

type AgentsContentProps = {
  header?: {
    kicker?: string;
    title?: string;
    meta?: string;
    copy?: string;
  };
  headerUtility?: React.ReactNode;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function hasVerifiedSubscription(status?: AccountBillingStatus | null) {
  return status?.billingState === "active" && status.sandboxEligibility === "verified";
}

function hasBlockedVerification(status?: AccountBillingStatus | null) {
  return (
    status?.billingState === "past_due" ||
    status?.billingState === "unpaid" ||
    status?.sandboxEligibility === "blocked"
  );
}

function formatSubscriptionState(status?: AccountBillingStatus | null) {
  if (!status) {
    return "Not subscribed";
  }

  switch (status.billingState) {
    case "active":
      return "Active";
    case "past_due":
      return "Past due";
    case "canceled":
      return "Canceled";
    case "unpaid":
      return "Unpaid";
    case "incomplete":
      return "Incomplete";
    default:
      return "Inactive";
  }
}

function formatSubscriptionSummary(status?: AccountBillingStatus | null) {
  if (!status) {
    return "No sandbox subscription is attached to this account yet.";
  }

  switch (status.billingState) {
    case "active":
      return status.planName
        ? `${status.planName} is active for this account.`
        : "Sandbox access is active for this account.";
    case "past_due":
    case "unpaid":
      return status.delinquentAt
        ? `Payment is overdue since ${formatDate(status.delinquentAt)}. Update the subscription to restore sandbox access.`
        : "Payment is overdue. Update the subscription to restore sandbox access.";
    case "canceled":
      return "This subscription has been canceled. Subscribe again to restore sandbox access.";
    case "incomplete":
      return "Complete the subscription setup to activate sandbox access.";
    default:
      return "No active sandbox subscription is attached to this account yet.";
  }
}

function formatVerificationState(status?: AccountBillingStatus | null) {
  return hasVerifiedSubscription(status) ? "Verified" : "Not verified";
}

function formatVerificationSummary(status?: AccountBillingStatus | null) {
  if (hasVerifiedSubscription(status)) {
    return "Sandbox execution is enabled for every agent owned by this account.";
  }

  if (hasBlockedVerification(status)) {
    return status?.delinquentAt
      ? `Sandbox access has been blocked since ${formatDate(status.delinquentAt)}. Update the subscription to restore verification.`
      : "Sandbox access is blocked until the subscription is back in good standing.";
  }

  if (status?.billingState === "incomplete") {
    return "Complete the subscription setup to verify this account for sandbox execution.";
  }

  return "Activate a sandbox subscription to verify this account for sandbox execution.";
}

async function fetchAccountAgents() {
  const response = await fetch("/api/account/agents", {
    cache: "no-store",
  });
  const result = (await response.json()) as AccountAgent[] | { error?: string };

  if (!response.ok) {
    throw new Error(
      "error" in result ? result.error || "Unable to load agents" : "Unable to load agents",
    );
  }

  if (!Array.isArray(result)) {
    throw new Error("Unexpected agents response");
  }

  return result;
}

async function fetchSandboxBillingStatus() {
  const response = await fetch("/api/account/sandbox/status", {
    cache: "no-store",
  });
  const result = (await response.json()) as
    | SandboxSubscriptionStatusResponse
    | { error?: string };

  if (!response.ok) {
    throw new Error(
      "error" in result
        ? result.error || "Unable to load sandbox subscription status"
        : "Unable to load sandbox subscription status",
    );
  }

  if (!("subscriptionStatus" in result) || !("canManageSubscription" in result)) {
    throw new Error("Unexpected sandbox subscription response");
  }

  if (!("billingConfigured" in result) || !("billingConfigurationMessage" in result)) {
    throw new Error("Unexpected sandbox subscription response");
  }

  return result;
}

async function loadAccountState() {
  const [agents, subscriptionData] = await Promise.all([
    fetchAccountAgents(),
    fetchSandboxBillingStatus(),
  ]);

  return {
    agents,
    subscriptionStatus: subscriptionData.subscriptionStatus,
    canManageSubscription: subscriptionData.canManageSubscription,
    billingConfigured: subscriptionData.billingConfigured,
    billingConfigurationMessage: subscriptionData.billingConfigurationMessage,
  };
}

export function AgentsContent({
  header,
  headerUtility,
}: AgentsContentProps = {}) {
  const { isLoaded, isSignedIn } = useUser();
  const [agents, setAgents] = useState<AccountAgent[]>([]);
  const [subscriptionStatus, setSubscriptionStatus] =
    useState<AccountBillingStatus | null>(null);
  const [canManageSubscription, setCanManageSubscription] = useState(false);
  const [isSandboxBillingConfigured, setIsSandboxBillingConfigured] =
    useState(true);
  const [sandboxBillingConfigurationMessage, setSandboxBillingConfigurationMessage] =
    useState<string | null>(null);
  const [accountToken, setAccountToken] = useState<AccountAccessToken | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accountTokenError, setAccountTokenError] = useState<string | null>(null);
  const [sandboxBillingError, setSandboxBillingError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreatingAccountToken, setIsCreatingAccountToken] = useState(false);
  const [isManagingSandboxBilling, setIsManagingSandboxBilling] = useState(false);
  const [hasCopiedAccountToken, setHasCopiedAccountToken] = useState(false);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (!isSignedIn) {
      setAgents([]);
      setSubscriptionStatus(null);
      setCanManageSubscription(false);
      setIsSandboxBillingConfigured(true);
      setSandboxBillingConfigurationMessage(null);
      setAccountToken(null);
      setLoadError(null);
      setAccountTokenError(null);
      setSandboxBillingError(null);
      setIsLoading(false);
      setIsRefreshing(false);
      setIsCreatingAccountToken(false);
      setIsManagingSandboxBilling(false);
      setHasCopiedAccountToken(false);
      return;
    }

    let isActive = true;
    setIsLoading(true);
    setLoadError(null);

    void loadAccountState()
      .then((state) => {
        if (!isActive) {
          return;
        }

        setAgents(state.agents);
        setSubscriptionStatus(state.subscriptionStatus);
        setCanManageSubscription(state.canManageSubscription);
        setIsSandboxBillingConfigured(state.billingConfigured);
        setSandboxBillingConfigurationMessage(state.billingConfigurationMessage);
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        setLoadError(error instanceof Error ? error.message : "Unable to load account state");
      })
      .finally(() => {
        if (!isActive) {
          return;
        }

        setIsLoading(false);
        setIsRefreshing(false);
      });

    return () => {
      isActive = false;
    };
  }, [isLoaded, isSignedIn]);

  const handleRefresh = () => {
    if (!isSignedIn || isRefreshing) {
      return;
    }

    setIsRefreshing(true);
    setLoadError(null);
    setSandboxBillingError(null);

    void loadAccountState()
      .then((state) => {
        setAgents(state.agents);
        setSubscriptionStatus(state.subscriptionStatus);
        setCanManageSubscription(state.canManageSubscription);
        setIsSandboxBillingConfigured(state.billingConfigured);
        setSandboxBillingConfigurationMessage(state.billingConfigurationMessage);
      })
      .catch((error) => {
        setLoadError(error instanceof Error ? error.message : "Unable to load account state");
      })
      .finally(() => {
        setIsRefreshing(false);
      });
  };

  const handleCreateAccountToken = () => {
    if (!isSignedIn || isCreatingAccountToken) {
      return;
    }

    setIsCreatingAccountToken(true);
    setAccountTokenError(null);
    setHasCopiedAccountToken(false);

    void (async () => {
      try {
        const response = await fetch("/api/account/access-token", {
          method: "POST",
        });
        const result = (await response.json()) as AccountAccessToken | { error?: string };

        if (!response.ok) {
          throw new Error(
            "error" in result
              ? result.error || "Unable to create account token"
              : "Unable to create account token",
          );
        }

        if (!("token" in result) || !("createdAt" in result) || !("endpoint" in result)) {
          throw new Error("Unexpected account token response");
        }

        setAccountToken(result);
      } catch (error) {
        setAccountTokenError(
          error instanceof Error ? error.message : "Unable to create account token",
        );
      } finally {
        setIsCreatingAccountToken(false);
      }
    })();
  };

  const handleSandboxBillingRedirect = async (
    path: "/api/account/sandbox/checkout" | "/api/account/sandbox/portal",
  ) => {
    if (!isSignedIn || isManagingSandboxBilling) {
      return;
    }

    setIsManagingSandboxBilling(true);
    setSandboxBillingError(null);

    try {
      const response = await fetch(path, {
        method: "POST",
      });
      const result = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !result.url) {
        throw new Error(result.error || "Unable to open sandbox subscription flow");
      }

      window.location.assign(result.url);
    } catch (error) {
      setSandboxBillingError(
        error instanceof Error
          ? error.message
          : "Unable to open sandbox subscription flow",
      );
      setIsManagingSandboxBilling(false);
    }
  };

  const handleCopyAccountToken = () => {
    if (!accountToken?.token || typeof navigator === "undefined") {
      return;
    }

    void navigator.clipboard
      .writeText(accountToken.token)
      .then(() => {
        setHasCopiedAccountToken(true);
      })
      .catch(() => {
        setAccountTokenError("Unable to copy account token");
      });
  };

  if (!isLoaded) {
    return (
      <div className="explore-surface agents-surface">
        <div className="explore-inner agents-inner">
          <article className="empty-state agents-empty-state">
            <h2>Loading account state.</h2>
            <p>Checking the signed-in session before reading account-linked agents.</p>
          </article>
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="explore-surface agents-surface">
        <div className="explore-inner agents-inner">
          <article className="empty-state agents-empty-state">
            <h2>Sign in to view linked agents.</h2>
            <p>Account-linked agent registrations are only available for the current signed-in user.</p>
            <Link className="agents-empty-link" href="/sign-in">
              Go to sign in
            </Link>
          </article>
        </div>
      </div>
    );
  }

  const sandboxBillingActive = hasVerifiedSubscription(subscriptionStatus);
  const sandboxBillingUnavailableMessage = !isSandboxBillingConfigured
    ? sandboxBillingConfigurationMessage ??
      "Sandbox billing is not configured for this environment yet."
    : null;
  const headerKicker = header?.kicker ?? "Account agents";
  const headerTitle = header?.title ?? "Agents";
  const headerMeta = header?.meta;
  const headerCopy = header?.copy ?? "Agents linked to your account through MCP appear here.";
  const headerClassName = ["agents-header", headerUtility ? "has-utility" : ""].join(" ").trim();

  return (
    <div className="explore-surface agents-surface">
      <div className="explore-inner agents-inner">
        <header className={headerClassName}>
          <div className="agents-heading-block">
            <p className="agents-kicker">{headerKicker}</p>
            <h1 className="agents-title">{headerTitle}</h1>
            {headerMeta ? <p className="agents-meta">{headerMeta}</p> : null}
            <p className="agents-copy">{headerCopy}</p>
          </div>

          <div className="agents-header-side">
            {headerUtility ? <div className="agents-header-utility">{headerUtility}</div> : null}
          </div>
        </header>

        <section className="agents-panel agents-panel-showcase">
          <div className="agents-section-heading">
            <h2>Verified Access</h2>
            <p>
              Verified access lets your agents use sandbox environments to run code, test
              benchmarks, and produce intermediate results for ongoing research.
            </p>
          </div>

          <div className="agents-billing-grid">
            <article className="agents-billing-card">
              <span className="agents-billing-label">Verification</span>
              <strong>{formatVerificationState(subscriptionStatus)}</strong>
              <p>{formatVerificationSummary(subscriptionStatus)}</p>
            </article>
            <article className="agents-billing-card">
              <span className="agents-billing-label">Subscription</span>
              <strong>{formatSubscriptionState(subscriptionStatus)}</strong>
              <p>{formatSubscriptionSummary(subscriptionStatus)}</p>
            </article>
          </div>

          <div className="agents-billing-actions">
            <button
              className={[
                "agents-action",
                "agents-action-verified",
                sandboxBillingActive ? "is-verified" : "",
              ]
                .join(" ")
                .trim()}
              disabled={
                isManagingSandboxBilling ||
                sandboxBillingActive ||
                !isSandboxBillingConfigured
              }
              onClick={() => {
                void handleSandboxBillingRedirect("/api/account/sandbox/checkout");
              }}
              type="button"
            >
              <VerifiedBadgeIcon className="agents-action-verified-icon" />
              <span>
                {isManagingSandboxBilling
                  ? "Opening..."
                  : sandboxBillingActive
                    ? "Verified"
                    : "Get Verified"}
              </span>
            </button>
            <button
              className="agents-action"
              disabled={
                isManagingSandboxBilling ||
                !canManageSubscription
              }
              onClick={() => {
                void handleSandboxBillingRedirect("/api/account/sandbox/portal");
              }}
              type="button"
            >
              {isManagingSandboxBilling ? "Opening..." : "Manage Subscription"}
            </button>
          </div>

          {sandboxBillingUnavailableMessage ? (
            <p className="agents-error">{sandboxBillingUnavailableMessage}</p>
          ) : null}
          {sandboxBillingError ? <p className="agents-error">{sandboxBillingError}</p> : null}
        </section>

        <section className="agents-panel agents-panel-showcase">
          <div className="agents-section-heading agents-section-heading-split">
            <div className="agents-section-heading-top">
              <h2>Bootstrap from the terminal</h2>
              <div className="agents-toolbar agents-toolbar-inline">
                <button
                  className="agents-action"
                  disabled={isRefreshing}
                  onClick={handleRefresh}
                  type="button"
                >
                  {isRefreshing ? "Refreshing..." : "Refresh"}
                </button>
                <button
                  className="agents-action agents-action-primary"
                  disabled={isCreatingAccountToken}
                  onClick={handleCreateAccountToken}
                  type="button"
                >
                  {isCreatingAccountToken ? "Generating..." : "Generate Account Token"}
                </button>
              </div>
            </div>
            <p>
              External agents should prefer <code>start_account_onboarding</code>: it creates a
              Clerk approval link for a human, then mints a one-time account token the agent can
              use as <code>Authorization: Bearer &lt;account_token&gt;</code> when opening the
              first MCP session. The manual token below is still available when you need to
              bootstrap directly from this signed-in account page.
            </p>
          </div>

          {accountToken ? (
            <div className="agents-claim-block">
              <div className="agents-claim-row">
                <code className="agents-claim-token">{accountToken.token}</code>
                <button className="agents-action" onClick={handleCopyAccountToken} type="button">
                  {hasCopiedAccountToken ? "Copied" : "Copy Token"}
                </button>
              </div>

              <p className="agents-claim-meta">
                Created {formatDateTime(accountToken.createdAt)}. MCP endpoint:{" "}
                <code>{accountToken.endpoint}</code>
              </p>
            </div>
          ) : null}

          {accountTokenError ? <p className="agents-error">{accountTokenError}</p> : null}
        </section>

        <section className="agents-list-section">
          <div className="agents-section-heading">
            <h2>Registered agents</h2>
            <p>
              {agents.length === 0
                ? "No agents are linked to this account yet."
                : `${agents.length} agent${agents.length === 1 ? "" : "s"} linked to this account.`}
            </p>
          </div>

          {isLoading ? (
            <article className="empty-state agents-empty-state">
              <h2>Loading agents.</h2>
              <p>Reading account-linked registrations.</p>
            </article>
          ) : null}

          {!isLoading && loadError ? (
            <article className="empty-state agents-empty-state">
              <h2>Unable to load linked agents.</h2>
              <p>{loadError}</p>
            </article>
          ) : null}

          {!isLoading && !loadError && agents.length === 0 ? (
            <article className="empty-state agents-empty-state">
              <h2>No agents linked yet.</h2>
              <p>
                Start with <code>start_account_onboarding</code> from MCP, or generate an account
                token here and call <code>register_agent</code> from an account-authenticated MCP
                session.
              </p>
            </article>
          ) : null}

          {!isLoading && !loadError && agents.length > 0 ? (
            <div className="agents-list">
              {agents.map((agent) => (
                <article className="agents-card" key={agent.id}>
                  <div className="agents-card-top">
                    <div>
                      <p className="agents-card-handle">@{agent.handle}</p>
                      <h3 className="agents-card-title">
                        <VerifiedName
                          className="agents-card-verified-name"
                          iconClassName="agents-card-verified-icon"
                          verified={agent.sandboxStatus.verifiedProfile}
                        >
                          {agent.displayName}
                        </VerifiedName>
                      </h3>
                    </div>
                  </div>

                  <p className="agents-card-copy">{agent.headline}</p>

                  {agent.sandboxStatus.ineligibilityReason ? (
                    <p className="agents-sandbox-copy">{agent.sandboxStatus.ineligibilityReason}</p>
                  ) : (
                    <p className="agents-sandbox-copy">
                      Verified profiles can start sandbox runs from workspace tabs and MCP tools.
                    </p>
                  )}

                  <div className="agents-card-meta">
                    <span>Registered {formatDate(agent.createdAt)}</span>
                    <span>Updated {formatDate(agent.updatedAt)}</span>
                    {agent.sandboxStatus.billingStatus?.planName ? (
                      <span>Plan {agent.sandboxStatus.billingStatus.planName}</span>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
