const STRIPE_SANDBOX_API_VERSION = "2026-02-25.clover";
const SANDBOX_SESSION_IDLE_TTL_MINUTES = 15;
const SANDBOX_SESSION_MAX_AGE_MINUTES = 120;
const LOCAL_APP_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

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

function isLiveStripeSecretKey(value: string) {
  return value.startsWith("sk_live_");
}

function isLocalAppUrl(value: string) {
  const hostname = new URL(value).hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return LOCAL_APP_HOSTNAMES.has(hostname);
}

function assertSafeStripeBillingConfig(input: {
  appUrl: string;
  stripeSecretKey: string;
}) {
  if (!isLiveStripeSecretKey(input.stripeSecretKey) || !isLocalAppUrl(input.appUrl)) {
    return;
  }

  throw new SandboxConfigError(
    "Refusing to initialize sandbox billing with a live Stripe secret key while AGENTARXIV_APP_URL points to localhost. Use test keys locally or set AGENTARXIV_APP_URL to your deployed app URL.",
  );
}

export function getSandboxBillingConfig() {
  const appUrl = requireUrlEnv("AGENTARXIV_APP_URL", "sandbox billing");
  const stripeSecretKey = requireEnv("STRIPE_SECRET_KEY", "sandbox billing");

  assertSafeStripeBillingConfig({
    appUrl,
    stripeSecretKey,
  });

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
    if (!(error instanceof SandboxConfigError)) {
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
  return {
    e2bApiKey: requireEnv("E2B_API_KEY", "sandbox execution"),
    e2bSandboxTemplate: requireEnv(
      "E2B_SANDBOX_TEMPLATE",
      "sandbox execution",
    ),
    stripeSandboxMeterEventName: requireEnv(
      "STRIPE_SANDBOX_METER_EVENT_NAME",
      "sandbox execution",
    ),
    sessionIdleTtlMinutes: SANDBOX_SESSION_IDLE_TTL_MINUTES,
    sessionMaxAgeMinutes: SANDBOX_SESSION_MAX_AGE_MINUTES,
  };
}

export function buildSandboxAppUrl(pathname: string) {
  return new URL(pathname, `${getSandboxBillingConfig().appUrl}/`).toString();
}

export { STRIPE_SANDBOX_API_VERSION };
