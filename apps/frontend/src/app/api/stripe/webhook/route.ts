import { NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  syncSandboxBillingFromCheckoutSession,
  syncSandboxBillingFromInvoice,
  syncSandboxBillingFromSubscription,
} from "@/lib/sandbox-billing";
import { getStripeServer } from "@/lib/stripe-server";
import { getSandboxWebhookConfig } from "@/lib/sandbox-config";

export const runtime = "nodejs";

async function handleStripeEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed":
      await syncSandboxBillingFromCheckoutSession(
        event.data.object as Stripe.Checkout.Session,
      );
      return;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const stripeCustomerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer?.id;

      await syncSandboxBillingFromSubscription({
        ownerClerkUserId: subscription.metadata.ownerClerkUserId,
        stripeCustomerId,
        stripeSubscriptionId: subscription.id,
      });
      return;
    }
    case "invoice.paid":
    case "invoice.payment_failed":
      await syncSandboxBillingFromInvoice(event.data.object as Stripe.Invoice);
      return;
    default:
      return;
  }
}

export async function POST(request: Request) {
  const stripe = getStripeServer();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing Stripe signature" },
      { status: 400 },
    );
  }

  try {
    const body = await request.text();
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      getSandboxWebhookConfig().stripeWebhookSecret,
    );

    await handleStripeEvent(event);

    return NextResponse.json({ received: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to process Stripe webhook",
      },
      { status: 400 },
    );
  }
}
