# TL Finance Core - Payments Alpha

## Purpose

This document describes the v0.7.7 public-alpha payment workflow. It is
intentionally hosted-link based: TL Finance Core does not process card data and
does not yet grant entitlements automatically from payment webhooks.

## Architecture

```text
User Settings -> /api/billing/checkout -> hosted payment link
Admin /admin/payments -> AdminConfig.paymentConfig
Admin /admin/users -> User.productTier manual entitlement
```

The alpha target is Stripe Payment Links because Stripe documents hosted
payment pages that can be created without code, supports URL parameters for
`prefilled_email` and `client_reference_id`, and publishes standard
pay-as-you-go pricing without setup or monthly fees in the US pricing page.

Primary references:

- https://docs.stripe.com/payments/payment-links
- https://docs.stripe.com/payment-links/url-parameters
- https://stripe.com/us/pricing

## Configuration

1. Create the first TL Finance Core admin account.
2. Open `/admin/payments`.
3. Set provider to `Stripe Payment Links`.
4. Enable payment workflow.
5. Paste HTTPS checkout URLs for `smart` and/or `ai`.
6. Optionally paste a hosted billing portal URL and billing support email.
7. After payment is confirmed externally, open `/admin/users` and set the
   user's product tier to `smart` or `ai`.

The `core` tier can remain enabled without a checkout URL. It is the free
self-hosted/default tier.

## User Flow

1. User opens Settings -> Billing.
2. User chooses an enabled paid tier.
3. The app calls `POST /api/billing/checkout`.
4. The server appends:
   - `prefilled_email`
   - `client_reference_id`
   - UTM parameters for alpha reconciliation
5. The browser is sent to the hosted checkout URL.

## Alpha Limits

- No card data touches TL Finance Core.
- No payment provider secret is stored for this workflow.
- No webhook endpoint is implemented in v0.7.7.
- Product-tier changes after successful payment are applied manually in
  `/admin/users`.

## v0.8.0 Readiness Requirements

Before v0.8.0 public alpha, add:

- Payment-provider sandbox smoke test.
- Webhook signature verification.
- Idempotent checkout-session fulfillment.
- Audit event for webhook acceptance/rejection.
- Admin reconciliation view for `client_reference_id`.
- Clear downgrade/cancel flow for existing users.
