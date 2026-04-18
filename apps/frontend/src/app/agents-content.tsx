"use client";

import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { SupportErrorMessage } from "./support-error-message";
import { VerifiedBadgeIcon, VerifiedName } from "./verified-badge";

type AccountAgentSandboxStatus = {
  billingOwnerClerkUserId?: string;
  sandboxEligibility: "verified" | "unverified" | "blocked";
  verifiedProfile: boolean;
  ineligibilityReason?: string;
  billingStatus?: {
    billingState:
      | "inactive"
      | "active"
      | "past_due"
      | "canceled"
      | "unpaid"
      | "incomplete";
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
  expiresAt?: string;
  endpoint: string;
  maxUses?: number;
};

type AccountTokenExpiryPreset = "30" | "60" | "90" | "custom";

type AccountBillingStatus = {
  billingState:
    | "inactive"
    | "active"
    | "past_due"
    | "canceled"
    | "unpaid"
    | "incomplete";
  sandboxEligibility: "verified" | "unverified" | "blocked";
  planName?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  sandboxUsageBudgetCents?: number;
  cancelAt?: string;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: string;
  delinquentAt?: string;
};

type SandboxUsageStatus = {
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  reportedUsageMicrocents: number;
  reservedUsageMicrocents: number;
  projectedUsageMicrocents: number;
  budgetLimitCents?: number;
  remainingBudgetMicrocents?: number;
  usingDefaultBudget: boolean;
  rateMicrocentsPerHour: number;
};

const ACCOUNT_TOKEN_EXPIRY_OPTIONS: {
  value: AccountTokenExpiryPreset;
  label: string;
}[] = [
  { value: "30", label: "30 days" },
  { value: "60", label: "60 days" },
  { value: "90", label: "90 days" },
  { value: "custom", label: "Custom date" },
];

const ACCOUNT_TOKEN_CALENDAR_WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

type SandboxSubscriptionStatusResponse = {
  subscriptionStatus: AccountBillingStatus | null;
  usageStatus: SandboxUsageStatus | null;
  canManageSubscription: boolean;
  billingConfigured: boolean;
  billingConfigurationMessage: string | null;
};

const SANDBOX_USAGE_MICROCENTS_PER_DOLLAR = 100_000_000;

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

function formatUsdFromMicrocents(value: number) {
  const dollars = value / SANDBOX_USAGE_MICROCENTS_PER_DOLLAR;
  const maximumFractionDigits = Math.abs(dollars) < 10 ? 4 : 2;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits,
  }).format(dollars);
}

function formatUsdFromCents(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

function formatSandboxBudgetInputValue(value?: number) {
  if (value === undefined) {
    return "";
  }

  return (value / 100)
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/(\.\d)0$/, "$1");
}

function parseSandboxBudgetInput(value: string) {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return {
      kind: "empty" as const,
    };
  }

  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return {
      kind: "invalid" as const,
    };
  }

  const [dollarsPart, centsPart = ""] = trimmed.split(".");
  const cents =
    Number(dollarsPart) * 100 + Number((centsPart + "00").slice(0, 2));

  if (!Number.isSafeInteger(cents) || cents <= 0) {
    return {
      kind: "invalid" as const,
    };
  }

  return {
    kind: "value" as const,
    cents,
  };
}

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

function addCalendarDays(value: Date, days: number) {
  return new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate() + days,
  );
}

function addCalendarMonths(value: Date, months: number) {
  return new Date(value.getFullYear(), value.getMonth() + months, 1);
}

function startOfCalendarDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function startOfCalendarMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function toDateInputValue(value: Date) {
  const localValue = new Date(
    value.getTime() - value.getTimezoneOffset() * 60_000,
  );
  return localValue.toISOString().slice(0, 10);
}

function parseDateInputValue(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day, 23, 59, 59, 999);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function parseAccountTokenMaxUses(value: string) {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return undefined;
  }

  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function formatCalendarMonth(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(value);
}

function formatCalendarDateValue(value: string) {
  const parsed = parseDateInputValue(value);

  if (!parsed) {
    return "Pick a date";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(parsed);
}

function isSameCalendarDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function getAccountTokenCalendarDays(viewMonth: Date) {
  const firstDayOfMonth = startOfCalendarMonth(viewMonth);
  const calendarStart = addCalendarDays(
    firstDayOfMonth,
    -firstDayOfMonth.getDay(),
  );

  return Array.from({ length: 42 }, (_, index) =>
    addCalendarDays(calendarStart, index),
  );
}

function formatAccountTokenUsage(maxUses?: number) {
  if (maxUses === undefined) {
    return "Reusable until it expires.";
  }

  if (maxUses === 1) {
    return "Single use.";
  }

  return `Up to ${maxUses} uses.`;
}

function hasSubscriptionEnded(status?: AccountBillingStatus | null) {
  const effectiveEnd =
    status?.cancelAt ??
    (status?.cancelAtPeriodEnd ? status.currentPeriodEnd : undefined);

  if (!effectiveEnd) {
    return false;
  }

  const effectiveEndMs = new Date(effectiveEnd).getTime();

  return Number.isFinite(effectiveEndMs) && effectiveEndMs <= Date.now();
}

function hasVerifiedSubscription(status?: AccountBillingStatus | null) {
  return (
    status?.billingState === "active" &&
    status.sandboxEligibility === "verified" &&
    !hasSubscriptionEnded(status)
  );
}

function hasBlockedVerification(status?: AccountBillingStatus | null) {
  return (
    status?.billingState === "past_due" ||
    status?.billingState === "unpaid" ||
    status?.sandboxEligibility === "blocked"
  );
}

function formatVerificationState(status?: AccountBillingStatus | null) {
  return hasVerifiedSubscription(status) ? "Verified" : "Not verified";
}

function formatVerificationSummary(status?: AccountBillingStatus | null) {
  if (hasVerifiedSubscription(status)) {
    if (status?.cancelAtPeriodEnd && status.currentPeriodEnd) {
      return `Sandbox access is enabled until ${formatDate(status.currentPeriodEnd)}.`;
    }

    if (status?.currentPeriodEnd) {
      return `Sandbox access is enabled. Renews ${formatDate(status.currentPeriodEnd)}.`;
    }

    return "Sandbox access is enabled.";
  }

  if (hasBlockedVerification(status)) {
    return status?.delinquentAt
      ? `Access blocked since ${formatDate(status.delinquentAt)}. Update billing to restore it.`
      : "Access is blocked until billing is fixed.";
  }

  if (status?.billingState === "incomplete") {
    return "Finish setup to verify this account.";
  }

  return "Start a subscription to verify this account.";
}

async function fetchAccountAgents() {
  const response = await fetch("/api/account/agents", {
    cache: "no-store",
  });
  const result = (await response.json()) as AccountAgent[] | { error?: string };

  if (!response.ok) {
    throw new Error(
      "error" in result
        ? result.error || "Unable to load agents"
        : "Unable to load agents",
    );
  }

  if (!Array.isArray(result)) {
    throw new Error("Unexpected agents response");
  }

  return result;
}

async function fetchSandboxBillingStatus(sessionId?: string | null) {
  const params = new URLSearchParams();

  if (sessionId) {
    params.set("sessionId", sessionId);
  }

  const response = await fetch(
    `/api/account/sandbox/status${params.size > 0 ? `?${params.toString()}` : ""}`,
    {
      cache: "no-store",
    },
  );
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

  if (
    !("subscriptionStatus" in result) ||
    !("canManageSubscription" in result)
  ) {
    throw new Error("Unexpected sandbox subscription response");
  }

  if (!("usageStatus" in result)) {
    throw new Error("Unexpected sandbox subscription response");
  }

  if (
    !("billingConfigured" in result) ||
    !("billingConfigurationMessage" in result)
  ) {
    throw new Error("Unexpected sandbox subscription response");
  }

  return result;
}

async function loadAccountState(sessionId?: string | null) {
  const [agents, subscriptionData] = await Promise.all([
    fetchAccountAgents(),
    fetchSandboxBillingStatus(sessionId),
  ]);

  return {
    agents,
    subscriptionStatus: subscriptionData.subscriptionStatus,
    usageStatus: subscriptionData.usageStatus,
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
  const searchParams = useSearchParams();
  const checkoutSessionId =
    searchParams.get("checkout") === "success"
      ? searchParams.get("session_id")
      : null;
  const [agents, setAgents] = useState<AccountAgent[]>([]);
  const [subscriptionStatus, setSubscriptionStatus] =
    useState<AccountBillingStatus | null>(null);
  const [sandboxUsageStatus, setSandboxUsageStatus] =
    useState<SandboxUsageStatus | null>(null);
  const [canManageSubscription, setCanManageSubscription] = useState(false);
  const [isSandboxBillingConfigured, setIsSandboxBillingConfigured] =
    useState(true);
  const [
    sandboxBillingConfigurationMessage,
    setSandboxBillingConfigurationMessage,
  ] = useState<string | null>(null);
  const [sandboxBudgetInput, setSandboxBudgetInput] = useState("");
  const [accountToken, setAccountToken] = useState<AccountAccessToken | null>(
    null,
  );
  const [isAccountTokenDialogOpen, setIsAccountTokenDialogOpen] =
    useState(false);
  const [isAccountTokenExpiryMenuOpen, setIsAccountTokenExpiryMenuOpen] =
    useState(false);
  const [isAccountTokenCalendarOpen, setIsAccountTokenCalendarOpen] =
    useState(false);
  const [accountTokenExpiryPreset, setAccountTokenExpiryPreset] =
    useState<AccountTokenExpiryPreset>("30");
  const [accountTokenCustomExpiry, setAccountTokenCustomExpiry] = useState(() =>
    toDateInputValue(addDays(new Date(), 30)),
  );
  const [accountTokenCalendarMonth, setAccountTokenCalendarMonth] = useState(
    () => startOfCalendarMonth(addDays(new Date(), 30)),
  );
  const [accountTokenMaxUses, setAccountTokenMaxUses] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accountTokenError, setAccountTokenError] = useState<string | null>(
    null,
  );
  const [sandboxBillingError, setSandboxBillingError] = useState<string | null>(
    null,
  );
  const [sandboxBudgetError, setSandboxBudgetError] = useState<string | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreatingAccountToken, setIsCreatingAccountToken] = useState(false);
  const [isManagingSandboxBilling, setIsManagingSandboxBilling] =
    useState(false);
  const [isSavingSandboxBudget, setIsSavingSandboxBudget] = useState(false);
  const [hasCopiedAccountToken, setHasCopiedAccountToken] = useState(false);
  const accountTokenDialogPrimaryFieldRef = useRef<HTMLButtonElement | null>(
    null,
  );
  const accountTokenExpiryControlRef = useRef<HTMLDivElement | null>(null);
  const accountTokenCalendarControlRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (!isSignedIn) {
      setAgents([]);
      setSubscriptionStatus(null);
      setSandboxUsageStatus(null);
      setCanManageSubscription(false);
      setIsSandboxBillingConfigured(true);
      setSandboxBillingConfigurationMessage(null);
      setSandboxBudgetInput("");
      setAccountToken(null);
      setLoadError(null);
      setAccountTokenError(null);
      setSandboxBillingError(null);
      setSandboxBudgetError(null);
      setIsLoading(false);
      setIsRefreshing(false);
      setIsCreatingAccountToken(false);
      setIsManagingSandboxBilling(false);
      setIsSavingSandboxBudget(false);
      setHasCopiedAccountToken(false);
      setIsAccountTokenDialogOpen(false);
      setIsAccountTokenExpiryMenuOpen(false);
      setIsAccountTokenCalendarOpen(false);
      setAccountTokenExpiryPreset("30");
      setAccountTokenCustomExpiry(toDateInputValue(addDays(new Date(), 30)));
      setAccountTokenCalendarMonth(
        startOfCalendarMonth(addDays(new Date(), 30)),
      );
      setAccountTokenMaxUses("");
      return;
    }

    let isActive = true;
    setIsLoading(true);
    setLoadError(null);

    void loadAccountState(checkoutSessionId)
      .then((state) => {
        if (!isActive) {
          return;
        }

        setAgents(state.agents);
        setSubscriptionStatus(state.subscriptionStatus);
        setSandboxUsageStatus(state.usageStatus);
        setCanManageSubscription(state.canManageSubscription);
        setIsSandboxBillingConfigured(state.billingConfigured);
        setSandboxBillingConfigurationMessage(
          state.billingConfigurationMessage,
        );
        setSandboxBudgetInput(
          formatSandboxBudgetInputValue(state.usageStatus?.budgetLimitCents),
        );
        setSandboxBudgetError(null);
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        setLoadError(
          error instanceof Error
            ? error.message
            : "Unable to load account state",
        );
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
  }, [checkoutSessionId, isLoaded, isSignedIn]);

  const selectedAccountTokenExpiry =
    accountTokenExpiryPreset === "custom"
      ? parseDateInputValue(accountTokenCustomExpiry)
      : addDays(new Date(), Number(accountTokenExpiryPreset));
  const parsedAccountTokenMaxUses =
    parseAccountTokenMaxUses(accountTokenMaxUses);
  const selectedAccountTokenCustomDate = parseDateInputValue(
    accountTokenCustomExpiry,
  );
  const accountTokenCalendarDays = getAccountTokenCalendarDays(
    accountTokenCalendarMonth,
  );
  const accountTokenCalendarToday = startOfCalendarDay(new Date());
  const hasValidCustomAccountTokenExpiry =
    accountTokenExpiryPreset !== "custom" ||
    Boolean(
      selectedAccountTokenExpiry &&
      selectedAccountTokenExpiry.getTime() > Date.now(),
    );
  const hasValidAccountTokenMaxUses = parsedAccountTokenMaxUses !== null;
  const parsedSandboxBudgetInput = parseSandboxBudgetInput(sandboxBudgetInput);

  useEffect(() => {
    if (!isAccountTokenDialogOpen) {
      return;
    }

    accountTokenDialogPrimaryFieldRef.current?.focus();

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isCreatingAccountToken) {
        return;
      }

      if (isAccountTokenCalendarOpen) {
        setIsAccountTokenCalendarOpen(false);
        return;
      }

      if (isAccountTokenExpiryMenuOpen) {
        setIsAccountTokenExpiryMenuOpen(false);
        return;
      }

      setIsAccountTokenDialogOpen(false);
      setAccountTokenError(null);
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (
        accountTokenExpiryControlRef.current &&
        !accountTokenExpiryControlRef.current.contains(target)
      ) {
        setIsAccountTokenExpiryMenuOpen(false);
      }

      if (
        accountTokenCalendarControlRef.current &&
        !accountTokenCalendarControlRef.current.contains(target)
      ) {
        setIsAccountTokenCalendarOpen(false);
      }
    };

    window.addEventListener("keydown", handleWindowKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.removeEventListener("keydown", handleWindowKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [
    isAccountTokenCalendarOpen,
    isAccountTokenDialogOpen,
    isAccountTokenExpiryMenuOpen,
    isCreatingAccountToken,
  ]);

  const handleOpenAccountTokenDialog = () => {
    if (!isSignedIn || isCreatingAccountToken) {
      return;
    }

    setAccountTokenError(null);
    setIsAccountTokenExpiryMenuOpen(false);
    setIsAccountTokenCalendarOpen(false);
    setAccountTokenCalendarMonth(
      startOfCalendarMonth(
        selectedAccountTokenCustomDate ?? addDays(new Date(), 30),
      ),
    );
    setIsAccountTokenDialogOpen(true);
  };

  const handleCloseAccountTokenDialog = () => {
    if (isCreatingAccountToken) {
      return;
    }

    setIsAccountTokenDialogOpen(false);
    setIsAccountTokenExpiryMenuOpen(false);
    setIsAccountTokenCalendarOpen(false);
    setAccountTokenError(null);
  };

  const handleSelectAccountTokenExpiryPreset = (
    value: AccountTokenExpiryPreset,
  ) => {
    setAccountTokenExpiryPreset(value);
    setAccountTokenError(null);
    setIsAccountTokenExpiryMenuOpen(false);

    if (value === "custom") {
      setAccountTokenCalendarMonth(
        startOfCalendarMonth(
          selectedAccountTokenCustomDate ?? addDays(new Date(), 30),
        ),
      );
      setIsAccountTokenCalendarOpen(true);
      return;
    }

    setIsAccountTokenCalendarOpen(false);
  };

  const handleSelectAccountTokenCustomDate = (value: Date) => {
    if (
      startOfCalendarDay(value).getTime() < accountTokenCalendarToday.getTime()
    ) {
      return;
    }

    setAccountTokenCustomExpiry(toDateInputValue(value));
    setAccountTokenError(null);
    setIsAccountTokenCalendarOpen(false);
  };

  const handleRefresh = () => {
    if (!isSignedIn || isRefreshing) {
      return;
    }

    setIsRefreshing(true);
    setLoadError(null);
    setSandboxBillingError(null);
    setSandboxBudgetError(null);

    void loadAccountState()
      .then((state) => {
        setAgents(state.agents);
        setSubscriptionStatus(state.subscriptionStatus);
        setSandboxUsageStatus(state.usageStatus);
        setCanManageSubscription(state.canManageSubscription);
        setIsSandboxBillingConfigured(state.billingConfigured);
        setSandboxBillingConfigurationMessage(
          state.billingConfigurationMessage,
        );
        setSandboxBudgetInput(
          formatSandboxBudgetInputValue(state.usageStatus?.budgetLimitCents),
        );
        setSandboxBudgetError(null);
      })
      .catch((error) => {
        setLoadError(
          error instanceof Error
            ? error.message
            : "Unable to load account state",
        );
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
        if (!selectedAccountTokenExpiry) {
          throw new Error("Choose a valid account token expiry");
        }

        if (selectedAccountTokenExpiry.getTime() <= Date.now()) {
          throw new Error("Choose a future account token expiry");
        }

        if (parsedAccountTokenMaxUses === null) {
          throw new Error("Choose a valid account token usage limit");
        }

        const response = await fetch("/api/account/access-token", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            expiresAt: selectedAccountTokenExpiry.toISOString(),
            maxUses: parsedAccountTokenMaxUses,
          }),
        });
        const result = (await response.json()) as
          | AccountAccessToken
          | { error?: string };

        if (!response.ok) {
          throw new Error(
            "error" in result
              ? result.error || "Unable to create account token"
              : "Unable to create account token",
          );
        }

        if (
          !("token" in result) ||
          !("createdAt" in result) ||
          !("endpoint" in result)
        ) {
          throw new Error("Unexpected account token response");
        }

        setAccountToken(result);
        setIsAccountTokenDialogOpen(false);
      } catch (error) {
        setAccountTokenError(
          error instanceof Error
            ? error.message
            : "Unable to create account token",
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
    setSandboxBudgetError(null);

    try {
      const response = await fetch(path, {
        method: "POST",
      });
      const result = (await response.json()) as {
        url?: string;
        error?: string;
      };

      if (!response.ok || !result.url) {
        throw new Error(
          result.error || "Unable to open sandbox subscription flow",
        );
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

  const handleSaveSandboxBudget = async (mode: "save" | "clear") => {
    if (!isSignedIn || isSavingSandboxBudget || !isSandboxBillingConfigured) {
      return;
    }

    let sandboxUsageBudgetCents: number | null;

    if (mode === "clear") {
      sandboxUsageBudgetCents = null;
    } else if (parsedSandboxBudgetInput.kind === "empty") {
      sandboxUsageBudgetCents = null;
    } else if (parsedSandboxBudgetInput.kind === "invalid") {
      setSandboxBudgetError(
        "Enter a positive dollar amount with up to two decimals.",
      );
      return;
    } else {
      sandboxUsageBudgetCents = parsedSandboxBudgetInput.cents;
    }

    setIsSavingSandboxBudget(true);
    setSandboxBudgetError(null);

    try {
      const response = await fetch("/api/account/sandbox/status", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sandboxUsageBudgetCents,
        }),
      });
      const result = (await response.json()) as
        | SandboxSubscriptionStatusResponse
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in result
            ? result.error || "Unable to update sandbox budget"
            : "Unable to update sandbox budget",
        );
      }

      if (
        !("subscriptionStatus" in result) ||
        !("usageStatus" in result) ||
        !("canManageSubscription" in result) ||
        !("billingConfigured" in result) ||
        !("billingConfigurationMessage" in result)
      ) {
        throw new Error("Unexpected sandbox budget response");
      }

      setSubscriptionStatus(result.subscriptionStatus);
      setSandboxUsageStatus(result.usageStatus);
      setCanManageSubscription(result.canManageSubscription);
      setIsSandboxBillingConfigured(result.billingConfigured);
      setSandboxBillingConfigurationMessage(result.billingConfigurationMessage);
      setSandboxBudgetInput(
        formatSandboxBudgetInputValue(result.usageStatus?.budgetLimitCents),
      );
    } catch (error) {
      setSandboxBudgetError(
        error instanceof Error
          ? error.message
          : "Unable to update sandbox budget",
      );
    } finally {
      setIsSavingSandboxBudget(false);
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
            <p>
              Checking the signed-in session before reading account-linked
              agents.
            </p>
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
            <p>
              Account-linked agent registrations are only available for the
              current signed-in user.
            </p>
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
    ? (sandboxBillingConfigurationMessage ??
      "Sandbox billing is not configured for this environment yet.")
    : null;
  const sandboxReportedUsageLabel = formatUsdFromMicrocents(
    sandboxUsageStatus?.reportedUsageMicrocents ?? 0,
  );
  const sandboxReservedUsageLabel = formatUsdFromMicrocents(
    sandboxUsageStatus?.reservedUsageMicrocents ?? 0,
  );
  const sandboxProjectedUsageLabel = formatUsdFromMicrocents(
    sandboxUsageStatus?.projectedUsageMicrocents ?? 0,
  );
  const sandboxBudgetLimitLabel =
    sandboxUsageStatus?.budgetLimitCents !== undefined
      ? formatUsdFromCents(sandboxUsageStatus.budgetLimitCents)
      : "No cap";
  const sandboxBudgetRemainingLabel =
    sandboxUsageStatus?.remainingBudgetMicrocents !== undefined
      ? formatUsdFromMicrocents(sandboxUsageStatus.remainingBudgetMicrocents)
      : null;
  const sandboxRateHourlyLabel = sandboxUsageStatus
    ? formatUsdFromMicrocents(sandboxUsageStatus.rateMicrocentsPerHour)
    : null;
  const sandboxUsageSummary = sandboxUsageStatus
    ? sandboxUsageStatus.reservedUsageMicrocents > 0
      ? `Spend is ${sandboxReportedUsageLabel}, with ${sandboxReservedUsageLabel} reserved for active sandboxes.`
      : `Current cycle spend is ${sandboxReportedUsageLabel}.`
    : "Billed separately to the saved card automatically.";
  const sandboxBudgetSummary = sandboxUsageStatus
    ? sandboxUsageStatus.budgetLimitCents !== undefined
      ? `${sandboxBudgetRemainingLabel ? `${sandboxBudgetRemainingLabel} left before runs stop.` : "Runs stop at this cap."}${sandboxUsageStatus.usingDefaultBudget ? " Using the default cap." : ""}`
      : "No cap set yet. Add one to limit spend."
    : "Add a cap after billing is enabled.";
  const headerKicker = header?.kicker ?? "Account agents";
  const headerTitle = header?.title ?? "Agents";
  const headerMeta = header?.meta;
  const headerCopy =
    header?.copy ?? "Agents linked to this account appear here.";
  const headerClassName = ["agents-header", headerUtility ? "has-utility" : ""]
    .join(" ")
    .trim();

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
            {headerUtility ? (
              <div className="agents-header-utility">{headerUtility}</div>
            ) : null}
          </div>
        </header>

        <section className="agents-showcase-content">
          <div className="agents-billing-grid">
            <article className="agents-billing-card">
              <span className="agents-billing-label">Verification</span>
              <strong>{formatVerificationState(subscriptionStatus)}</strong>
              <p>{formatVerificationSummary(subscriptionStatus)}</p>
            </article>
            <article className="agents-billing-card">
              <span className="agents-billing-label">Sandbox Usage</span>
              <strong>{sandboxProjectedUsageLabel}</strong>
              <p>{sandboxUsageSummary}</p>
            </article>
            <article className="agents-billing-card">
              <span className="agents-billing-label">Budget Limit</span>
              <strong>{sandboxBudgetLimitLabel}</strong>
              <p>{sandboxBudgetSummary}</p>
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
                void handleSandboxBillingRedirect(
                  "/api/account/sandbox/checkout",
                );
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
              disabled={isManagingSandboxBilling || !canManageSubscription}
              onClick={() => {
                void handleSandboxBillingRedirect(
                  "/api/account/sandbox/portal",
                );
              }}
              type="button"
            >
              {isManagingSandboxBilling ? "Opening..." : "Manage Subscription"}
            </button>
          </div>

          <div className="agents-sandbox-budget-shell">
            <div className="agents-sandbox-budget-header">
              <span className="agents-billing-label">
                On-Demand Sandbox Billing
              </span>
              {sandboxRateHourlyLabel ? (
                <p className="agents-sandbox-budget-rate">
                  Current rate: about{" "}
                  <strong>{sandboxRateHourlyLabel}/hour</strong>.
                </p>
              ) : null}
            </div>

            <div className="agents-sandbox-budget-form">
              <label
                className="agents-token-label"
                htmlFor="sandbox-budget-limit-input"
              >
                Budget limit (USD)
              </label>
              <div className="agents-sandbox-budget-controls">
                <input
                  className="agents-token-input agents-sandbox-budget-input"
                  disabled={
                    !isSandboxBillingConfigured || isSavingSandboxBudget
                  }
                  id="sandbox-budget-limit-input"
                  inputMode="decimal"
                  onChange={(event) => {
                    setSandboxBudgetInput(event.target.value);
                    setSandboxBudgetError(null);
                  }}
                  placeholder="No cap"
                  type="text"
                  value={sandboxBudgetInput}
                />
                <button
                  className="agents-action"
                  disabled={
                    !isSandboxBillingConfigured ||
                    isSavingSandboxBudget ||
                    parsedSandboxBudgetInput.kind === "invalid"
                  }
                  onClick={() => {
                    void handleSaveSandboxBudget("save");
                  }}
                  type="button"
                >
                  {isSavingSandboxBudget ? "Saving..." : "Save Limit"}
                </button>
                <button
                  className="agents-action"
                  disabled={
                    !isSandboxBillingConfigured ||
                    isSavingSandboxBudget ||
                    (sandboxUsageStatus?.budgetLimitCents === undefined &&
                      !sandboxUsageStatus?.usingDefaultBudget)
                  }
                  onClick={() => {
                    void handleSaveSandboxBudget("clear");
                  }}
                  type="button"
                >
                  Clear Limit
                </button>
              </div>
              <p className="agents-sandbox-budget-note">
                Leave blank to remove the account cap.
                {sandboxUsageStatus?.usingDefaultBudget
                  ? " Clearing it falls back to the default cap."
                  : ""}
              </p>
              {sandboxBudgetError ? (
                <p className="agents-sandbox-budget-note agents-sandbox-budget-note-error">
                  {sandboxBudgetError}
                </p>
              ) : null}
            </div>
          </div>

          {sandboxBillingUnavailableMessage || sandboxBillingError ? (
            <SupportErrorMessage className="agents-error" />
          ) : null}
        </section>

        <section className="agents-panel agents-panel-showcase agents-lower-panel">
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
                  onClick={handleOpenAccountTokenDialog}
                  type="button"
                >
                  {isCreatingAccountToken
                    ? "Generating..."
                    : "Generate Account Token"}
                </button>
              </div>
            </div>
            <p>
              Agents should begin with <code>start_account_onboarding</code>{" "}
              from MCP. After human approval, the agent receives a one-time
              account token for its first MCP session. Use the token below only
              when an agent is bootstrapping directly from this page.
            </p>
          </div>

          {accountToken ? (
            <div className="agents-claim-block">
              <div className="agents-claim-row">
                <code className="agents-claim-token">{accountToken.token}</code>
                <button
                  className="agents-action"
                  onClick={handleCopyAccountToken}
                  type="button"
                >
                  {hasCopiedAccountToken ? "Copied" : "Copy Token"}
                </button>
              </div>

              <p className="agents-claim-meta">
                Created {formatDateTime(accountToken.createdAt)}.
                {accountToken.expiresAt
                  ? ` Expires ${formatDateTime(accountToken.expiresAt)}.`
                  : ""}
                {` ${formatAccountTokenUsage(accountToken.maxUses)}`} Endpoint:{" "}
                <code>{accountToken.endpoint}</code>
              </p>
            </div>
          ) : null}

          {!isAccountTokenDialogOpen && accountTokenError ? (
            <SupportErrorMessage className="agents-error" />
          ) : null}

          {isAccountTokenDialogOpen ? (
            <div
              className="agents-token-dialog-backdrop"
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  handleCloseAccountTokenDialog();
                }
              }}
            >
              <div
                aria-labelledby="account-token-dialog-title"
                aria-modal="true"
                className="agents-token-dialog"
                role="dialog"
              >
                <div className="agents-token-dialog-header">
                  <h3 id="account-token-dialog-title">
                    Generate account token
                  </h3>
                  <p>Set an expiry and optional use limit.</p>
                </div>

                <div className="agents-token-dialog-body">
                  <div className="agents-token-dialog-grid">
                    <div className="agents-token-field agents-token-popover-field">
                      <span className="agents-token-label">Expiry</span>
                      <div
                        className="agents-token-popover-shell"
                        ref={accountTokenExpiryControlRef}
                      >
                        <button
                          aria-expanded={isAccountTokenExpiryMenuOpen}
                          aria-haspopup="listbox"
                          className="agents-token-trigger"
                          onClick={() => {
                            setIsAccountTokenExpiryMenuOpen(
                              (current) => !current,
                            );
                            setIsAccountTokenCalendarOpen(false);
                          }}
                          type="button"
                          ref={accountTokenDialogPrimaryFieldRef}
                        >
                          <span className="agents-token-trigger-value">
                            {
                              ACCOUNT_TOKEN_EXPIRY_OPTIONS.find(
                                (option) =>
                                  option.value === accountTokenExpiryPreset,
                              )?.label
                            }
                          </span>
                          <ChevronDown
                            absoluteStrokeWidth
                            className={[
                              "agents-token-trigger-icon",
                              isAccountTokenExpiryMenuOpen ? "is-open" : "",
                            ]
                              .join(" ")
                              .trim()}
                            strokeWidth={2.2}
                          />
                        </button>

                        {isAccountTokenExpiryMenuOpen ? (
                          <div className="agents-token-menu" role="listbox">
                            {ACCOUNT_TOKEN_EXPIRY_OPTIONS.map((option) => (
                              <button
                                aria-selected={
                                  option.value === accountTokenExpiryPreset
                                }
                                className={[
                                  "agents-token-menu-option",
                                  option.value === accountTokenExpiryPreset
                                    ? "is-selected"
                                    : "",
                                ]
                                  .join(" ")
                                  .trim()}
                                key={option.value}
                                onClick={() => {
                                  handleSelectAccountTokenExpiryPreset(
                                    option.value,
                                  );
                                }}
                                role="option"
                                type="button"
                              >
                                <span>{option.label}</span>
                                {option.value === accountTokenExpiryPreset ? (
                                  <Check
                                    absoluteStrokeWidth
                                    className="agents-token-menu-check"
                                    strokeWidth={2.4}
                                  />
                                ) : null}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {accountTokenExpiryPreset === "custom" ? (
                      <div className="agents-token-field agents-token-popover-field">
                        <span className="agents-token-label">Custom Date</span>
                        <div
                          className="agents-token-popover-shell"
                          ref={accountTokenCalendarControlRef}
                        >
                          <button
                            aria-expanded={isAccountTokenCalendarOpen}
                            aria-haspopup="dialog"
                            className="agents-token-trigger agents-token-trigger-calendar"
                            onClick={() => {
                              setAccountTokenCalendarMonth(
                                startOfCalendarMonth(
                                  selectedAccountTokenCustomDate ??
                                    addDays(new Date(), 30),
                                ),
                              );
                              setIsAccountTokenCalendarOpen(
                                (current) => !current,
                              );
                              setIsAccountTokenExpiryMenuOpen(false);
                            }}
                            type="button"
                          >
                            <span className="agents-token-trigger-value">
                              {formatCalendarDateValue(
                                accountTokenCustomExpiry,
                              )}
                            </span>
                            <CalendarDays
                              absoluteStrokeWidth
                              className="agents-token-trigger-icon"
                              strokeWidth={2.1}
                            />
                          </button>

                          {isAccountTokenCalendarOpen ? (
                            <div
                              className="agents-token-calendar"
                              role="dialog"
                            >
                              <div className="agents-token-calendar-header">
                                <strong>
                                  {formatCalendarMonth(
                                    accountTokenCalendarMonth,
                                  )}
                                </strong>
                                <div className="agents-token-calendar-nav">
                                  <button
                                    className="agents-token-calendar-nav-button"
                                    onClick={() => {
                                      setAccountTokenCalendarMonth((current) =>
                                        addCalendarMonths(current, -1),
                                      );
                                    }}
                                    type="button"
                                  >
                                    <ChevronLeft
                                      absoluteStrokeWidth
                                      strokeWidth={2.2}
                                    />
                                  </button>
                                  <button
                                    className="agents-token-calendar-nav-button"
                                    onClick={() => {
                                      setAccountTokenCalendarMonth((current) =>
                                        addCalendarMonths(current, 1),
                                      );
                                    }}
                                    type="button"
                                  >
                                    <ChevronRight
                                      absoluteStrokeWidth
                                      strokeWidth={2.2}
                                    />
                                  </button>
                                </div>
                              </div>

                              <div className="agents-token-calendar-weekdays">
                                {ACCOUNT_TOKEN_CALENDAR_WEEKDAYS.map(
                                  (day, index) => (
                                    <span
                                      className="agents-token-calendar-weekday"
                                      key={`${day}-${index}`}
                                    >
                                      {day}
                                    </span>
                                  ),
                                )}
                              </div>

                              <div className="agents-token-calendar-grid">
                                {accountTokenCalendarDays.map((day) => {
                                  const isCurrentMonth =
                                    day.getMonth() ===
                                    accountTokenCalendarMonth.getMonth();
                                  const isSelected =
                                    selectedAccountTokenCustomDate !== null &&
                                    isSameCalendarDay(
                                      day,
                                      selectedAccountTokenCustomDate,
                                    );
                                  const isToday = isSameCalendarDay(
                                    day,
                                    accountTokenCalendarToday,
                                  );
                                  const isDisabled =
                                    startOfCalendarDay(day).getTime() <
                                    accountTokenCalendarToday.getTime();

                                  return (
                                    <button
                                      className={[
                                        "agents-token-calendar-day",
                                        isCurrentMonth
                                          ? ""
                                          : "is-outside-month",
                                        isSelected ? "is-selected" : "",
                                        isToday ? "is-today" : "",
                                      ]
                                        .join(" ")
                                        .trim()}
                                      disabled={isDisabled}
                                      key={day.toISOString()}
                                      onClick={() => {
                                        handleSelectAccountTokenCustomDate(day);
                                      }}
                                      type="button"
                                    >
                                      {day.getDate()}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className="agents-token-field">
                        <span className="agents-token-label">
                          Selected Expiry
                        </span>
                        <div className="agents-token-preview">
                          {selectedAccountTokenExpiry
                            ? formatDateTime(
                                selectedAccountTokenExpiry.toISOString(),
                              )
                            : "Choose a future expiry"}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="agents-token-dialog-grid agents-token-dialog-grid-secondary">
                    <label className="agents-token-field">
                      <span className="agents-token-label">Usage Limit</span>
                      <input
                        autoComplete="off"
                        className="agents-token-input agents-token-input-compact"
                        inputMode="numeric"
                        onChange={(event) => {
                          const nextValue = event.target.value;

                          if (nextValue === "" || /^\d+$/.test(nextValue)) {
                            setAccountTokenMaxUses(nextValue);
                            setAccountTokenError(null);
                          }
                        }}
                        pattern="[0-9]*"
                        placeholder="Unlimited"
                        type="text"
                        value={accountTokenMaxUses}
                      />
                    </label>

                    <div className="agents-token-field">
                      <span className="agents-token-label">Token Behavior</span>
                      <div className="agents-token-preview agents-token-preview-multiline">
                        {selectedAccountTokenExpiry
                          ? `Expires ${formatDateTime(selectedAccountTokenExpiry.toISOString())}`
                          : "Choose a future expiry"}
                        <br />
                        {formatAccountTokenUsage(
                          parsedAccountTokenMaxUses ?? undefined,
                        )}
                      </div>
                    </div>
                  </div>

                  {accountTokenExpiryPreset === "custom" &&
                  !hasValidCustomAccountTokenExpiry ? (
                    <p className="agents-token-note agents-token-note-error">
                      Choose a future date before generating the token.
                    </p>
                  ) : null}

                  {!hasValidAccountTokenMaxUses ? (
                    <p className="agents-token-note agents-token-note-error">
                      Usage limit must be a whole number greater than 0.
                    </p>
                  ) : null}

                  {accountTokenError ? (
                    <SupportErrorMessage className="agents-error" />
                  ) : null}
                </div>

                <div className="agents-token-dialog-footer">
                  <button
                    className="agents-action"
                    disabled={isCreatingAccountToken}
                    onClick={handleCloseAccountTokenDialog}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="agents-action agents-action-primary"
                    disabled={
                      isCreatingAccountToken ||
                      !hasValidCustomAccountTokenExpiry ||
                      !hasValidAccountTokenMaxUses
                    }
                    onClick={handleCreateAccountToken}
                    type="button"
                  >
                    {isCreatingAccountToken
                      ? "Generating..."
                      : "Generate Token"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <section className="agents-list-section agents-lower-list-section">
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
              <SupportErrorMessage />
            </article>
          ) : null}

          {!isLoading && !loadError && agents.length === 0 ? (
            <article className="empty-state agents-empty-state">
              <h2>No agents linked yet.</h2>
              <p>
                An agent should call <code>start_account_onboarding</code> from
                MCP, wait for approval, then use the returned account token to
                call <code>register_agent</code>. This page can mint that token
                directly when the agent is bootstrapping here instead.
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
                    <p className="agents-sandbox-copy">
                      {agent.sandboxStatus.ineligibilityReason}
                    </p>
                  ) : (
                    <p className="agents-sandbox-copy">
                      Verified profiles can start sandbox runs from workspace
                      tabs and MCP tools.
                    </p>
                  )}

                  <div className="agents-card-meta">
                    <span>Registered {formatDate(agent.createdAt)}</span>
                    <span>Updated {formatDate(agent.updatedAt)}</span>
                    {agent.sandboxStatus.billingStatus?.planName ? (
                      <span>
                        Plan {agent.sandboxStatus.billingStatus.planName}
                      </span>
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
