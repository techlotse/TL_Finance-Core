import { NextRequest } from "next/server";
import { handleApiError, jsonOk } from "@/lib/api";
import { requireAdminApi } from "@/lib/admin-guard";
import {
  loadAdminConfig,
  savePaymentConfig,
  type PaymentConfig,
  type PaymentTier
} from "@/lib/admin-config";
import { adminPaymentConfigPatchSchema } from "@/lib/schemas";
import { writeAudit } from "@/lib/audit";
import { ipHashFromHeaders } from "@/lib/auth";
import {
  isAllowedStripeBillingPortalUrl,
  isAllowedStripePaymentLinkUrl
} from "@/lib/billing";

const TIERS: PaymentTier[] = ["core", "smart", "ai"];

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireAdminApi();
    const body = adminPaymentConfigPatchSchema.parse(await req.json());
    const current = (await loadAdminConfig()).paymentConfig;

    const tiers = { ...current.tiers };
    for (const tier of TIERS) {
      const patch = body.tiers?.[tier];
      if (!patch) continue;
      tiers[tier] = {
        ...tiers[tier],
        ...patch,
        priceLabel:
          patch.priceLabel === null
            ? undefined
            : patch.priceLabel ?? tiers[tier].priceLabel,
        summary:
          patch.summary === null
            ? undefined
            : patch.summary ?? tiers[tier].summary,
        checkoutUrl:
          patch.checkoutUrl === null
            ? undefined
            : patch.checkoutUrl ?? tiers[tier].checkoutUrl
      };
    }

    const patch: Partial<PaymentConfig> = {
      tiers
    };
    if (body.enabled !== undefined) patch.enabled = body.enabled;
    if (body.provider !== undefined) patch.provider = body.provider;
    if (body.billingPortalUrl !== undefined) {
      patch.billingPortalUrl = body.billingPortalUrl ?? undefined;
    }
    if (body.supportEmail !== undefined) {
      patch.supportEmail = body.supportEmail ?? undefined;
    }

    if (
      (patch.provider ?? current.provider) === "stripe_payment_links" &&
      patch.billingPortalUrl &&
      !isAllowedStripeBillingPortalUrl(patch.billingPortalUrl)
    ) {
      const err = new Error(
        "Billing portal URL must be a Stripe billing portal URL"
      ) as Error & { status?: number };
      err.status = 422;
      throw err;
    }

    for (const tier of TIERS) {
      const checkoutUrl = tiers[tier]?.checkoutUrl;
      if (checkoutUrl && !isAllowedStripePaymentLinkUrl(checkoutUrl)) {
        const err = new Error(
          `${tier} checkout URL must be a Stripe Payment Link`
        ) as Error & { status?: number };
        err.status = 422;
        throw err;
      }
    }

    const next = await savePaymentConfig(patch);

    await writeAudit({
      action: "admin_config_update",
      userId: ctx.user.id,
      resourceType: "admin_config",
      resourceId: "paymentConfig",
      ipHash: ipHashFromHeaders(req.headers),
      metadata: {
        keys: Object.keys(body),
        tiers: Object.keys(body.tiers ?? {})
      }
    });

    return jsonOk({ ok: true, value: next });
  } catch (err) {
    return handleApiError(err);
  }
}
