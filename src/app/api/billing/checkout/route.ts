import { NextRequest } from "next/server";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { loadAdminConfig, type PaymentTier } from "@/lib/admin-config";
import { billingCheckoutSchema } from "@/lib/schemas";
import { buildHostedCheckoutUrl } from "@/lib/billing";
import { writeAudit } from "@/lib/audit";
import { ipHashFromHeaders } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    const body = billingCheckoutSchema.parse(await req.json());
    const tier = body.tier as PaymentTier;
    const cfg = (await loadAdminConfig()).paymentConfig;

    if (!cfg.enabled || cfg.provider === "none") {
      return jsonError("Payments are not enabled on this instance", 503);
    }

    const tierCfg = cfg.tiers[tier];
    if (!tierCfg?.enabled || !tierCfg.checkoutUrl) {
      return jsonError("This payment tier is not available", 404);
    }

    const url = buildHostedCheckoutUrl({
      baseUrl: tierCfg.checkoutUrl,
      userId: ctx.user.id,
      email: ctx.user.email,
      tier
    });

    await writeAudit({
      action: "billing_checkout_start",
      userId: ctx.user.id,
      householdId: ctx.membership?.householdId,
      resourceType: "billing_checkout",
      resourceId: tier,
      ipHash: ipHashFromHeaders(req.headers),
      metadata: {
        provider: cfg.provider,
        currentTier: ctx.user.productTier
      }
    });

    return jsonOk({ ok: true, url });
  } catch (err) {
    return handleApiError(err);
  }
}
