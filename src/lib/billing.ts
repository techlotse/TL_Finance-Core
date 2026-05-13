import type { PaymentTier } from "./admin-config";

interface CheckoutUrlInput {
  baseUrl: string;
  userId: string;
  email: string;
  tier: PaymentTier;
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
