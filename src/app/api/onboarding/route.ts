import type { NextRequest } from "next/server";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { onboardingSchema } from "@/lib/schemas";
import { getSession, ipHashFromHeaders } from "@/lib/auth";
import { assertEmailVerifiedForAppAccess } from "@/lib/auth-policy";
import { applyOnboarding } from "@/lib/onboarding";
import { writeAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const ctx = await getSession();
    if (!ctx) return jsonError("Not authenticated", 401);
    await assertEmailVerifiedForAppAccess(ctx.user);
    if (ctx.membership) {
      return jsonError("Onboarding has already been completed", 409);
    }

    const body = onboardingSchema.parse(await req.json());

    const household = await applyOnboarding({
      userId: ctx.user.id,
      householdName: body.householdName,
      baseCurrency: body.baseCurrency,
      earners: body.earners,
      categoryPreset: body.categoryPreset
    });

    await writeAudit({
      action: "create",
      userId: ctx.user.id,
      householdId: household.id,
      resourceType: "household",
      resourceId: household.id,
      ipHash: ipHashFromHeaders(req.headers),
      metadata: { preset: body.categoryPreset }
    });

    return jsonOk({ ok: true, householdId: household.id });
  } catch (err) {
    return handleApiError(err);
  }
}
