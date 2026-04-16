import Stripe from "stripe";
import { getSandboxBillingConfig } from "./sandbox-config";

let stripeClient: Stripe | undefined;

export function getStripeServer() {
  if (!stripeClient) {
    const config = getSandboxBillingConfig();

    stripeClient = new Stripe(config.stripeSecretKey, {
      apiVersion: config.stripeApiVersion as never,
    });
  }

  return stripeClient;
}
