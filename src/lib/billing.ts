import type { PaymentTier } from "./admin-config";

interface CheckoutUrlInput {
  baseUrl: string;
  userId: string;
  email: string;
  tier: PaymentTier;
}

const STRIPE_PAYMENT_LINK_HOSTS = new Set(["buy.stripe.com"]);
const STRIPE_BILLING_PORTAL_HOSTS = new Set(["billing.stripe.com"]);

function isAllowedHttpsHost(raw: string, hosts: Set<string>): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && hosts.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function isAllowedStripePaymentLinkUrl(raw: string): boolean {
  return isAllowedHttpsHost(raw, STRIPE_PAYMENT_LINK_HOSTS);
}

export function isAllowedStripeBillingPortalUrl(raw: string): boolean {
  return isAllowedHttpsHost(raw, STRIPE_BILLING_PORTAL_HOSTS);
}

export function stripeClientReference(input: {
  userId: string;
  tier: PaymentTier;
}): string {
  return `user_${input.userId}_${input.tier}`
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .slice(0, 200);
}

export function buildHostedCheckoutUrl(input: CheckoutUrlInput): string {
  if (!isAllowedStripePaymentLinkUrl(input.baseUrl)) {
    const err = new Error("Checkout URL is not an allowed Stripe Payment Link") as Error & {
      status?: number;
    };
    err.status = 422;
    throw err;
  }
  const url = new URL(input.baseUrl);
  url.searchParams.set("prefilled_email", input.email);
  url.searchParams.set(
    "client_reference_id",
    stripeClientReference({ userId: input.userId, tier: input.tier })
  );
  url.searchParams.set("utm_source", "tl_finance_core");
  url.searchParams.set("utm_medium", "app");
  url.searchParams.set("utm_campaign", `upgrade_${input.tier}`);
  return url.toString();
}
