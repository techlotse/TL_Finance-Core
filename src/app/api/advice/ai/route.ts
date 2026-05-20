import { NextRequest } from "next/server";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { requireSession, ipHashFromHeaders } from "@/lib/auth";
import { assertEmailVerifiedForAppAccess } from "@/lib/auth-policy";
import { loadAdminConfig, revealSecret } from "@/lib/admin-config";
import {
  buildClassicAdvice,
  buildFinancialSnapshot,
  buildSwissBridgeAdvice
} from "@/lib/advice";
import { generateOpenAiAdvice } from "@/lib/openai-advice";
import { hasPlanAtLeast, normaliseProductTier } from "@/lib/plans";
import { writeAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    await assertEmailVerifiedForAppAccess(ctx.user);
    if (!ctx.membership) {
      return jsonError("Household setup required", 409);
    }

    const tier = normaliseProductTier(ctx.user.productTier);
    if (!hasPlanAtLeast(tier, "ai")) {
      return jsonError("TL Finance AI plan required", 403);
    }

    const cfg = await loadAdminConfig();
    const apiKey = revealSecret(cfg.aiConfig.apiKeyCipher);
    if (!cfg.aiConfig.enabled || !apiKey) {
      return jsonError("OpenAI advice is not configured by the administrator", 503);
    }

    const snapshot = await buildFinancialSnapshot(ctx.membership.householdId);
    const classicAdvice = buildClassicAdvice(snapshot);
    const swissBridgeAdvice = buildSwissBridgeAdvice(snapshot);
    const aiAdvice = await generateOpenAiAdvice({
      apiKey,
      model: cfg.aiConfig.model,
      snapshot,
      classicAdvice,
      swissBridgeAdvice
    });

    await writeAudit({
      action: "ai_advice_generate",
      userId: ctx.user.id,
      householdId: ctx.membership.householdId,
      resourceType: "advice",
      resourceId: "ai",
      ipHash: ipHashFromHeaders(req.headers),
      metadata: { model: cfg.aiConfig.model }
    });

    return jsonOk({ ok: true, value: aiAdvice });
  } catch (err) {
    return handleApiError(err);
  }
}
