import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { buildActiveHouseholdCookie } from "@/lib/active-household";
import { handleApiError, jsonOk } from "@/lib/api";
import { requireSession, ipHashFromHeaders } from "@/lib/auth";
import { assertEmailVerifiedForAppAccess } from "@/lib/auth-policy";
import { createHouseholdForUser } from "@/lib/onboarding";
import { householdCreateSchema } from "@/lib/schemas";
import { writeAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    await assertEmailVerifiedForAppAccess(ctx.user);
    const body = householdCreateSchema.parse(await req.json());

    const created = await createHouseholdForUser({
      userId: ctx.user.id,
      householdName: body.householdName,
      baseCurrency: body.baseCurrency,
      earners: body.earners,
      categoryPreset: body.categoryPreset
    });

    const cookieStore = await cookies();
    cookieStore.set(buildActiveHouseholdCookie(created.membership.id));

    await writeAudit({
      action: "create",
      userId: ctx.user.id,
      householdId: created.household.id,
      resourceType: "household",
      resourceId: created.household.id,
      ipHash: ipHashFromHeaders(req.headers),
      metadata: { preset: body.categoryPreset, source: "settings" }
    });

    return jsonOk({
      ok: true,
      householdId: created.household.id,
      membershipId: created.membership.id
    });
  } catch (err) {
    return handleApiError(err);
  }
}
