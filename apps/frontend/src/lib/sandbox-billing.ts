import type { AccountBillingStatus } from "@agentarxiv/core";
import { currentUser } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { getAccountDisplayLabel } from "@/lib/account-display";
import { repository } from "@/lib/repository";
import { buildSandboxAppUrl, getSandboxBillingConfig } from "./sandbox-config";
import { getStripeServer } from "./stripe-server";

type BillingProjection = Pick<
  AccountBillingStatus,
  | "billingState"
  | "sandboxEligibility"
  | "delinquentAt"
  | "stripePriceId"
  | "stripeProductId"
  | "planName"
  | "planLookupKey"
  | "planMetadata"
  | "currentPeriodStart"
  | "currentPeriodEnd"
  | "cancelAt"
  | "cancelAtPeriodEnd"
  | "canceledAt"
>;

const SANDBOX_BRAND_NAME = "AgentArxiv";
const SANDBOX_PLAN_NAME = "AgentArxiv Verified";
const SANDBOX_PLAN_DESCRIPTION =
  "Unlock secure sandbox access for agents linked to your account to execute code, test ideas, and produce verified research results.";
const SANDBOX_PORTAL_HEADLINE = "AgentArxiv by WormAI, Inc.";
const SANDBOX_STATEMENT_DESCRIPTOR = "AGENTARXIV VERIFIED";
const SANDBOX_BRANDING_LOGO_FILE_ID = "file_1TMCRvA6IQORzoHbENbJ2mXv";
const SANDBOX_BRANDING_ICON_FILE_ID = "file_1TMCTYA6IQORzoHbBgRTaoCK";
const SANDBOX_PRODUCT_IMAGE_URL =
  "https://files.stripe.com/links/MDB8YWNjdF8xUzhHQ3pBNklRT1J6b0hifGZsX2xpdmVfZlJjcFNaWXBKc1I3aDhNUDkxUmdUbzBm00wHOVYjRA";
const SANDBOX_PROMOTION_CODE = "RESEARCH";

function toStripeCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined,
) {
  if (!customer) {
    return undefined;
  }

  return typeof customer === "string" ? customer : customer.id;
}

function toStripeProductId(
  product: string | Stripe.Product | Stripe.DeletedProduct | null | undefined,
) {
  if (!product) {
    return undefined;
  }

  return typeof product === "string" ? product : product.id;
}

function getSandboxBaseSubscriptionItem(subscription: Stripe.Subscription) {
  const config = getSandboxBillingConfig();

  return (
    subscription.items.data.find((item) => item.price?.id === config.stripeSandboxPriceId) ??
    subscription.items.data.find(
      (item) =>
        item.price?.recurring?.usage_type !== "metered" &&
        toStripeProductId(item.price?.product) === config.stripeSandboxProductId,
    ) ??
    subscription.items.data[0]
  );
}

function toIsoStringFromUnixTimestamp(timestamp?: number | null) {
  return typeof timestamp === "number"
    ? new Date(timestamp * 1000).toISOString()
    : undefined;
}

function getSubscriptionCurrentPeriodEnd(
  subscription: Stripe.Subscription,
  existing?: AccountBillingStatus,
) {
  const itemPeriodEnds = subscription.items.data
    .map((item) => item.current_period_end)
    .filter((value): value is number => typeof value === "number");

  if (itemPeriodEnds.length === 0) {
    return existing?.currentPeriodEnd;
  }

  return new Date(Math.max(...itemPeriodEnds) * 1000).toISOString();
}

function getSubscriptionCurrentPeriodStart(
  subscription: Stripe.Subscription,
  existing?: AccountBillingStatus,
) {
  const itemPeriodStarts = subscription.items.data
    .map((item) => item.current_period_start)
    .filter((value): value is number => typeof value === "number");

  if (itemPeriodStarts.length === 0) {
    return existing?.currentPeriodStart;
  }

  return new Date(Math.min(...itemPeriodStarts) * 1000).toISOString();
}

function subscriptionContainsSandboxProduct(
  subscription: Stripe.Subscription,
  productId: string,
) {
  return subscription.items.data.some(
    (item) => toStripeProductId(item.price?.product) === productId,
  );
}

function blocksNewSandboxCheckout(subscription: Stripe.Subscription) {
  switch (subscription.status) {
    case "active":
    case "past_due":
    case "unpaid":
    case "paused":
    case "trialing":
    case "incomplete":
      return true;
    default:
      return false;
  }
}

function subscriptionContainsSandboxUsagePrice(
  subscription: Stripe.Subscription,
  usagePriceId: string,
) {
  return subscription.items.data.some((item) => item.price?.id === usagePriceId);
}

async function findExistingSandboxSubscription(
  stripe: Stripe,
  stripeCustomerId: string,
  stripeProductId: string,
) {
  const subscriptions = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: "all",
    limit: 20,
    expand: ["data.items.data.price.product"],
  });

  return (
    subscriptions.data.find(
      (subscription) =>
        blocksNewSandboxCheckout(subscription) &&
        subscriptionContainsSandboxProduct(subscription, stripeProductId),
    ) ?? null
  );
}

async function ensureSandboxUsageSubscriptionItem(
  stripe: Stripe,
  subscription: Stripe.Subscription,
) {
  const { stripeSandboxUsagePriceId } = getSandboxBillingConfig();

  if (
    subscription.status === "canceled" ||
    subscription.status === "incomplete_expired" ||
    subscriptionContainsSandboxUsagePrice(subscription, stripeSandboxUsagePriceId)
  ) {
    return subscription;
  }

  await stripe.subscriptionItems.create(
    {
      subscription: subscription.id,
      price: stripeSandboxUsagePriceId,
      proration_behavior: "none",
      metadata: {
        sandboxUsage: "metered",
      },
    },
    {
      idempotencyKey: `sandbox_usage_item_${subscription.id}_${stripeSandboxUsagePriceId}`,
    },
  );

  return stripe.subscriptions.retrieve(subscription.id, {
    expand: ["items.data.price.product"],
  });
}

function resolveDelinquentAt(input: {
  billingState: AccountBillingStatus["billingState"];
  canceledAt?: string;
  existing?: AccountBillingStatus;
}) {
  const { billingState, canceledAt, existing } = input;

  if (
    billingState !== "past_due" &&
    billingState !== "unpaid" &&
    billingState !== "canceled"
  ) {
    return undefined;
  }

  const existingWasBlocked =
    existing?.billingState === "past_due" ||
    existing?.billingState === "unpaid" ||
    existing?.billingState === "canceled" ||
    existing?.sandboxEligibility === "blocked";

  if (existingWasBlocked && existing?.delinquentAt) {
    return existing.delinquentAt;
  }

  return canceledAt ?? new Date().toISOString();
}

async function resolveSandboxBillingCustomerName() {
  const user = await currentUser();

  if (!user) {
    return "AgentArxiv Account";
  }

  return getAccountDisplayLabel(
    {
      fullName: user.fullName,
      username: user.username,
      firstName: user.firstName,
      primaryEmailAddress: user.primaryEmailAddress,
    },
    "AgentArxiv Account",
  );
}

async function syncSandboxBillingCustomerProfile(
  stripeCustomerId: string,
  ownerClerkUserId: string,
) {
  const stripe = getStripeServer();
  const name = await resolveSandboxBillingCustomerName();

  return stripe.customers.update(stripeCustomerId, {
    metadata: {
      ownerClerkUserId,
    },
    name,
  });
}

async function syncSandboxCheckoutProductPresentation(
  stripe: Stripe,
  productId: string,
) {
  await stripe.products.update(productId, {
    description: SANDBOX_PLAN_DESCRIPTION,
    images: [SANDBOX_PRODUCT_IMAGE_URL],
    name: SANDBOX_PLAN_NAME,
    statement_descriptor: SANDBOX_STATEMENT_DESCRIPTOR,
    url: buildSandboxAppUrl("/agents?billing=sandbox"),
  });
}

async function syncSandboxPortalPresentation(stripe: Stripe) {
  const configurations = await stripe.billingPortal.configurations.list({
    limit: 20,
  });
  const defaultConfiguration = configurations.data.find(
    (configuration) => configuration.is_default,
  );

  if (!defaultConfiguration) {
    return;
  }

  if (defaultConfiguration.business_profile.headline === SANDBOX_PORTAL_HEADLINE) {
    return;
  }

  await stripe.billingPortal.configurations.update(defaultConfiguration.id, {
    business_profile: {
      headline: SANDBOX_PORTAL_HEADLINE,
      privacy_policy_url:
        defaultConfiguration.business_profile.privacy_policy_url ?? undefined,
      terms_of_service_url:
        defaultConfiguration.business_profile.terms_of_service_url ?? undefined,
    },
  });
}

function getSandboxCheckoutBrandingSettings() {
  return {
    background_color: "#000000",
    border_style: "rounded" as const,
    button_color: "#17c964",
    display_name: SANDBOX_BRAND_NAME,
    font_family: "inter" as const,
    icon: {
      type: "file" as const,
      file: SANDBOX_BRANDING_ICON_FILE_ID,
    },
    logo: {
      type: "file" as const,
      file: SANDBOX_BRANDING_LOGO_FILE_ID,
    },
  };
}

function getSandboxCheckoutCustomText() {
  return {
    submit: {
      message:
        `AgentArxiv Verified renews at $10 per month. Sandbox runtime is metered separately and billed to the saved card on file. Use promo code ${SANDBOX_PROMOTION_CODE} for $3 off. Cancel anytime from the billing portal.`,
    },
  };
}

function projectSandboxSubscriptionState(input: {
  subscription: Stripe.Subscription;
  existing?: AccountBillingStatus;
  ownerClerkUserId: string;
}): BillingProjection {
  const { subscription, existing } = input;
  const config = getSandboxBillingConfig();
  const price = getSandboxBaseSubscriptionItem(subscription)?.price;
  const stripePriceId = price?.id ?? existing?.stripePriceId;
  const stripeProductId =
    toStripeProductId(price?.product) ?? existing?.stripeProductId;

  if (!stripePriceId) {
    throw new Error(
      `Sandbox subscription ${subscription.id} is missing its price reference`,
    );
  }

  if (!stripeProductId) {
    throw new Error(
      `Sandbox subscription ${subscription.id} is missing its product reference`,
    );
  }

  if (stripeProductId !== config.stripeSandboxProductId) {
    throw new Error(
      `Stripe subscription ${subscription.id} is attached to product ${stripeProductId}, expected ${config.stripeSandboxProductId}`,
    );
  }

  let billingState: AccountBillingStatus["billingState"];
  let sandboxEligibility: AccountBillingStatus["sandboxEligibility"];

  switch (subscription.status) {
    case "active":
      billingState = "active";
      sandboxEligibility = "verified";
      break;
    case "past_due":
      billingState = "past_due";
      sandboxEligibility = "blocked";
      break;
    case "unpaid":
      billingState = "unpaid";
      sandboxEligibility = "blocked";
      break;
    case "canceled":
      billingState = "canceled";
      sandboxEligibility = "blocked";
      break;
    case "trialing":
    case "paused":
    case "incomplete":
    case "incomplete_expired":
      billingState = "incomplete";
      sandboxEligibility = "unverified";
      break;
    default:
      billingState = "inactive";
      sandboxEligibility = "unverified";
      break;
  }

  const currentPeriodStart = getSubscriptionCurrentPeriodStart(subscription, existing);
  const currentPeriodEnd = getSubscriptionCurrentPeriodEnd(subscription, existing);
  const cancelAt = toIsoStringFromUnixTimestamp(subscription.cancel_at);
  const canceledAt = toIsoStringFromUnixTimestamp(subscription.canceled_at);
  const delinquentAt = resolveDelinquentAt({
    billingState,
    canceledAt,
    existing,
  });

  return {
    billingState,
    sandboxEligibility,
    delinquentAt,
    stripePriceId,
    stripeProductId,
    planName: SANDBOX_PLAN_NAME,
    planLookupKey:
      price?.lookup_key ??
      existing?.planLookupKey ??
      config.stripeSandboxPlanLookupKey,
    currentPeriodStart,
    currentPeriodEnd,
    cancelAt,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    canceledAt,
    planMetadata: {
      stripe_subscription_status: subscription.status,
      stripe_price_lookup_key:
        price?.lookup_key ??
        existing?.planMetadata.stripe_price_lookup_key ??
        "",
      stripe_usage_price_id: config.stripeSandboxUsagePriceId,
      sandbox_plan_lookup_key: config.stripeSandboxPlanLookupKey,
    },
  };
}

async function resolveOwnerClerkUserIdFromStripeCustomerId(stripeCustomerId: string) {
  const existing =
    await repository.findAccountBillingStatusByStripeCustomerId(stripeCustomerId);

  if (existing) {
    return existing.ownerClerkUserId;
  }

  const stripe = getStripeServer();
  const customer = await stripe.customers.retrieve(stripeCustomerId);

  if (customer.deleted) {
    throw new Error(`Stripe customer ${stripeCustomerId} was deleted`);
  }

  const ownerClerkUserId = customer.metadata.ownerClerkUserId?.trim();

  if (!ownerClerkUserId) {
    throw new Error(
      `Stripe customer ${stripeCustomerId} is missing ownerClerkUserId metadata`,
    );
  }

  return ownerClerkUserId;
}

async function retrieveCurrentSubscription(
  stripeSubscriptionId: string,
  customerId?: string,
) {
  const stripe = getStripeServer();

  try {
    return await stripe.subscriptions.retrieve(stripeSubscriptionId, {
      expand: ["items.data.price.product"],
    });
  } catch (error) {
    if (!(error instanceof Stripe.errors.StripeError) || error.code !== "resource_missing") {
      throw error;
    }

    const existing =
      await repository.findAccountBillingStatusByStripeSubscriptionId(
        stripeSubscriptionId,
      );

    if (!existing) {
      throw error;
    }

    return {
      id: stripeSubscriptionId,
      customer: customerId ?? existing.stripeCustomerId ?? "",
      metadata: {},
      status: "canceled",
      items: {
        data: existing.stripePriceId
          ? [
              {
                price: {
                  id: existing.stripePriceId,
                  lookup_key: existing.planLookupKey ?? null,
                  product: existing.stripeProductId ?? null,
                },
              },
            ]
          : [],
      },
    } as unknown as Stripe.Subscription;
  }
}

export async function ensureSandboxBillingCustomer(ownerClerkUserId: string) {
  const stripe = getStripeServer();
  const existing = await repository.getAccountBillingStatus(ownerClerkUserId);

  if (existing?.stripeCustomerId) {
    const customer = await syncSandboxBillingCustomerProfile(
      existing.stripeCustomerId,
      ownerClerkUserId,
    );

    if (customer.deleted) {
      throw new Error(`Stripe customer ${existing.stripeCustomerId} was deleted`);
    }

    return {
      billingStatus: existing,
      stripeCustomerId: customer.id,
    };
  }

  const customerName = await resolveSandboxBillingCustomerName();
  const customer = await stripe.customers.create({
    metadata: {
      ownerClerkUserId,
    },
    name: customerName,
  });

  const billingStatus = await repository.upsertAccountBillingStatus({
    ownerClerkUserId,
    stripeCustomerId: customer.id,
    billingState: "inactive",
    sandboxEligibility: "unverified",
    planName: SANDBOX_PLAN_NAME,
    planLookupKey: getSandboxBillingConfig().stripeSandboxPlanLookupKey,
    planMetadata: {},
    currentPeriodStart: existing?.currentPeriodStart,
    currentPeriodEnd: existing?.currentPeriodEnd,
    sandboxUsageBudgetCents: existing?.sandboxUsageBudgetCents,
    cancelAt: existing?.cancelAt,
    cancelAtPeriodEnd: existing?.cancelAtPeriodEnd,
    canceledAt: existing?.canceledAt,
    delinquentAt: existing?.delinquentAt,
    lastWebhookAt: existing?.lastWebhookAt,
  });

  return {
    billingStatus,
    stripeCustomerId: customer.id,
  };
}

export async function createSandboxCheckoutSession(ownerClerkUserId: string) {
  const stripe = getStripeServer();
  const config = getSandboxBillingConfig();
  const { billingStatus, stripeCustomerId } =
    await ensureSandboxBillingCustomer(ownerClerkUserId);

  await syncSandboxCheckoutProductPresentation(
    stripe,
    config.stripeSandboxProductId,
  );

  if (
    billingStatus?.billingState === "active" &&
    billingStatus.sandboxEligibility === "verified"
  ) {
    throw new Error(
      "Sandbox subscription is already active for this profile. Manage the subscription instead.",
    );
  }

  const existingStripeSubscription = await findExistingSandboxSubscription(
    stripe,
    stripeCustomerId,
    config.stripeSandboxProductId,
  );

  if (existingStripeSubscription) {
    await syncSandboxBillingFromSubscription({
      ownerClerkUserId,
      stripeCustomerId,
      stripeSubscriptionId: existingStripeSubscription.id,
    });

    throw new Error(
      existingStripeSubscription.status === "incomplete"
        ? "Sandbox subscription setup is already in progress for this profile. Manage the existing subscription instead."
        : "A sandbox subscription already exists for this profile. Manage the subscription instead.",
    );
  }

  const session = await stripe.checkout.sessions.create({
    allow_promotion_codes: true,
    automatic_tax: {
      enabled: true,
    },
    mode: "subscription",
    customer: stripeCustomerId,
    billing_address_collection: "required",
    branding_settings: getSandboxCheckoutBrandingSettings(),
    client_reference_id: ownerClerkUserId,
    success_url: buildSandboxAppUrl(
      "/agents?billing=sandbox&checkout=success&session_id={CHECKOUT_SESSION_ID}",
    ),
    cancel_url: buildSandboxAppUrl("/agents?billing=sandbox&checkout=canceled"),
    custom_text: getSandboxCheckoutCustomText(),
    customer_update: {
      address: "auto",
      name: "auto",
    },
    line_items: [
      {
        price: config.stripeSandboxPriceId,
        quantity: 1,
      },
      {
        price: config.stripeSandboxUsagePriceId,
      },
    ],
    metadata: {
      ownerClerkUserId,
      sandboxPlanLookupKey: config.stripeSandboxPlanLookupKey,
    },
    subscription_data: {
      metadata: {
        ownerClerkUserId,
        sandboxPlanLookupKey: config.stripeSandboxPlanLookupKey,
      },
    },
  });

  if (!session.url) {
    throw new Error("Sandbox subscription checkout did not return a redirect URL");
  }

  return session;
}

export async function createSandboxPortalSession(ownerClerkUserId: string) {
  const stripe = getStripeServer();
  const billingStatus = await repository.getAccountBillingStatus(ownerClerkUserId);

  if (!billingStatus?.stripeCustomerId) {
    throw new Error(
      "Sandbox subscription is not configured for this profile yet. Start a subscription first.",
    );
  }

  await syncSandboxBillingCustomerProfile(
    billingStatus.stripeCustomerId,
    ownerClerkUserId,
  );
  await syncSandboxPortalPresentation(stripe);

  return stripe.billingPortal.sessions.create({
    customer: billingStatus.stripeCustomerId,
    return_url: buildSandboxAppUrl("/agents?billing=sandbox"),
  });
}

export async function syncSandboxBillingFromSubscription(input: {
  ownerClerkUserId?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId: string;
}) {
  const stripe = getStripeServer();
  const existing =
    await repository.findAccountBillingStatusByStripeSubscriptionId(
      input.stripeSubscriptionId,
    );
  const retrievedSubscription = await retrieveCurrentSubscription(
    input.stripeSubscriptionId,
    input.stripeCustomerId,
  );
  const subscription = await ensureSandboxUsageSubscriptionItem(
    stripe,
    retrievedSubscription,
  );
  const stripeCustomerId =
    input.stripeCustomerId ?? toStripeCustomerId(subscription.customer);

  if (!stripeCustomerId) {
    throw new Error(
      `Stripe subscription ${input.stripeSubscriptionId} is missing its customer reference`,
    );
  }

  const ownerClerkUserId =
    input.ownerClerkUserId?.trim() ||
    subscription.metadata.ownerClerkUserId?.trim() ||
    existing?.ownerClerkUserId ||
    (await resolveOwnerClerkUserIdFromStripeCustomerId(stripeCustomerId));
  const ownerExisting =
    existing ?? (await repository.getAccountBillingStatus(ownerClerkUserId));
  const projection = projectSandboxSubscriptionState({
    subscription,
    existing: ownerExisting,
    ownerClerkUserId,
  });

  return repository.upsertAccountBillingStatus({
    ownerClerkUserId,
    stripeCustomerId,
    stripeSubscriptionId: subscription.id,
    stripePriceId: projection.stripePriceId,
    stripeProductId: projection.stripeProductId,
    billingState: projection.billingState,
    sandboxEligibility: projection.sandboxEligibility,
    planName: projection.planName,
    planLookupKey: projection.planLookupKey,
    planMetadata: projection.planMetadata,
    currentPeriodStart: projection.currentPeriodStart,
    currentPeriodEnd: projection.currentPeriodEnd,
    sandboxUsageBudgetCents: ownerExisting?.sandboxUsageBudgetCents,
    cancelAt: projection.cancelAt,
    cancelAtPeriodEnd: projection.cancelAtPeriodEnd,
    canceledAt: projection.canceledAt,
    delinquentAt: projection.delinquentAt,
    lastWebhookAt: new Date().toISOString(),
  });
}

export async function syncSandboxBillingFromCheckoutSession(
  session: Stripe.Checkout.Session,
) {
  const ownerClerkUserId =
    session.metadata?.ownerClerkUserId?.trim() ??
    session.client_reference_id?.trim();
  const stripeCustomerId = toStripeCustomerId(session.customer);
  const stripeSubscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

  if (!ownerClerkUserId) {
    throw new Error(
      `Checkout session ${session.id} is missing ownerClerkUserId metadata`,
    );
  }

  if (!stripeCustomerId) {
    throw new Error(`Checkout session ${session.id} is missing a customer id`);
  }

  if (!stripeSubscriptionId) {
    const existing = await repository.getAccountBillingStatus(ownerClerkUserId);

    return repository.upsertAccountBillingStatus({
      ownerClerkUserId,
      stripeCustomerId,
      billingState: "inactive",
      sandboxEligibility: "unverified",
      planName: SANDBOX_PLAN_NAME,
      planLookupKey: getSandboxBillingConfig().stripeSandboxPlanLookupKey,
      planMetadata: {
        checkout_session_id: session.id,
      },
      currentPeriodStart: existing?.currentPeriodStart,
      currentPeriodEnd: existing?.currentPeriodEnd,
      sandboxUsageBudgetCents: existing?.sandboxUsageBudgetCents,
      cancelAt: existing?.cancelAt,
      cancelAtPeriodEnd: existing?.cancelAtPeriodEnd,
      canceledAt: existing?.canceledAt,
      delinquentAt: existing?.delinquentAt,
      lastWebhookAt: new Date().toISOString(),
    });
  }

  return syncSandboxBillingFromSubscription({
    ownerClerkUserId,
    stripeCustomerId,
    stripeSubscriptionId,
  });
}

export async function syncSandboxBillingFromCheckoutSessionId(input: {
  checkoutSessionId: string;
  ownerClerkUserId?: string;
}) {
  const stripe = getStripeServer();
  const session = await stripe.checkout.sessions.retrieve(input.checkoutSessionId, {
    expand: ["subscription"],
  });
  const expectedOwnerClerkUserId = input.ownerClerkUserId?.trim();
  const sessionOwnerClerkUserId =
    session.metadata?.ownerClerkUserId?.trim() ?? session.client_reference_id?.trim();

  if (
    expectedOwnerClerkUserId &&
    sessionOwnerClerkUserId &&
    expectedOwnerClerkUserId !== sessionOwnerClerkUserId
  ) {
    throw new Error(
      `Checkout session ${input.checkoutSessionId} does not belong to the signed-in account`,
    );
  }

  const synced = await syncSandboxBillingFromCheckoutSession(session);

  if (
    expectedOwnerClerkUserId &&
    synced.ownerClerkUserId !== expectedOwnerClerkUserId
  ) {
    throw new Error(
      `Checkout session ${input.checkoutSessionId} does not belong to the signed-in account`,
    );
  }

  return synced;
}

export async function syncSandboxBillingFromInvoice(invoice: Stripe.Invoice) {
  const stripeCustomerId = toStripeCustomerId(invoice.customer);
  const stripeSubscriptionRef =
    invoice.parent?.type === "subscription_details"
      ? invoice.parent.subscription_details?.subscription
      : undefined;
  const stripeSubscriptionId =
    typeof stripeSubscriptionRef === "string"
      ? stripeSubscriptionRef
      : stripeSubscriptionRef?.id;

  if (!stripeCustomerId || !stripeSubscriptionId) {
    throw new Error(`Invoice ${invoice.id} is missing sandbox billing references`);
  }

  return syncSandboxBillingFromSubscription({
    stripeCustomerId,
    stripeSubscriptionId,
  });
}
