import {
  SandboxUsageBillingConfigError,
  getSandboxUsageBillingConfig,
} from "@agentarxiv/core";

const STRIPE_SANDBOX_API_VERSION = "2026-02-25.clover";
const SANDBOX_SESSION_IDLE_TTL_MINUTES = 15;
const SANDBOX_SESSION_MAX_AGE_MINUTES = 120;
const SANDBOX_SUPPORT_ERROR_MESSAGE =
  "Error! Please contact teluashish@gmail.com for support.";

export class SandboxConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxConfigError";
  }
}

function requireEnv(name: string, context: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new SandboxConfigError(`${name} is required for ${context}`);
  }

  return value;
}

function requireUrlEnv(name: string, context: string) {
  const value = requireEnv(name, context);

  try {
    return new URL(value).toString().replace(/\/$/, "");
  } catch {
    throw new SandboxConfigError(`${name} must be a valid absolute URL`);
  }
}

export function getSandboxBillingConfig() {
  const appUrl = requireUrlEnv("AGENTARXIV_APP_URL", "sandbox billing");
  const stripeSecretKey = requireEnv("STRIPE_SECRET_KEY", "sandbox billing");
  const usageBillingConfig = getSandboxUsageBillingConfig();

  return {
    stripeApiVersion: STRIPE_SANDBOX_API_VERSION,
    appUrl,
    stripeSecretKey,
    stripeSandboxPriceId: requireEnv(
      "STRIPE_SANDBOX_PRICE_ID",
      "sandbox billing",
    ),
    stripeSandboxProductId: requireEnv(
      "STRIPE_SANDBOX_PRODUCT_ID",
      "sandbox billing",
    ),
    stripeSandboxPlanName: requireEnv(
      "STRIPE_SANDBOX_PLAN_NAME",
      "sandbox billing",
    ),
    stripeSandboxPlanLookupKey: requireEnv(
      "STRIPE_SANDBOX_PLAN_LOOKUP_KEY",
      "sandbox billing",
    ),
    stripeSandboxUsagePriceId: requireEnv(
      "STRIPE_SANDBOX_USAGE_PRICE_ID",
      "sandbox billing",
    ),
    sandboxUsagePriceUsdPerSecond:
      usageBillingConfig.usagePriceUsdPerSecond,
    sandboxDefaultUsageBudgetCents:
      usageBillingConfig.defaultBudgetCents,
  };
}

export function getSandboxBillingAvailability() {
  try {
    getSandboxBillingConfig();

    return {
      configured: true,
      message: null,
    } as const;
  } catch (error) {
    if (
      !(error instanceof SandboxConfigError) &&
      !(error instanceof SandboxUsageBillingConfigError)
    ) {
      throw error;
    }

    return {
      configured: false,
      message: error.message,
    } as const;
  }
}

export function getSandboxWebhookConfig() {
  return {
    stripeWebhookSecret: requireEnv(
      "STRIPE_WEBHOOK_SECRET",
      "sandbox billing webhooks",
    ),
  };
}

export function getSandboxExecutionConfig() {
  const e2bApiKey = process.env.E2B_API_KEY?.trim();
  const e2bSandboxTemplate = process.env.E2B_SANDBOX_TEMPLATE?.trim();
  const stripeSandboxMeterEventName =
    process.env.STRIPE_SANDBOX_METER_EVENT_NAME?.trim();

  if (!e2bApiKey || !e2bSandboxTemplate || !stripeSandboxMeterEventName) {
    throw new SandboxConfigError(SANDBOX_SUPPORT_ERROR_MESSAGE);
  }

  return {
    e2bApiKey,
    e2bSandboxTemplate,
    stripeSandboxMeterEventName,
    sessionIdleTtlMinutes: SANDBOX_SESSION_IDLE_TTL_MINUTES,
    sessionMaxAgeMinutes: SANDBOX_SESSION_MAX_AGE_MINUTES,
  };
}

export function buildSandboxAppUrl(pathname: string) {
  return new URL(pathname, `${getSandboxBillingConfig().appUrl}/`).toString();
}

export { STRIPE_SANDBOX_API_VERSION };
