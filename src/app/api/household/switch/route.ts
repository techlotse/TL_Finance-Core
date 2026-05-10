import type { NextRequest } from "next/server";
import { z } from "zod";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { assertEmailVerifiedForAppAccess } from "@/lib/auth-policy";
import {
  buildActiveHouseholdCookie,
  clearActiveHouseholdCookie
} from "@/lib/active-household";
import { cookies } from "next/headers";
import { writeAudit } from "@/lib/audit";
import { ipHashFromHeaders } from "@/lib/auth";

const bodySchema = z.object({
  /** Membership id to switch to. Pass null to clear the override and
   *  fall back to the default (first membership by createdAt). */
  membershipId: z.string().min(1).nullable()
});

/**
 * POST /api/household/switch
 *
 * Switches the active household for this session by writing the
 * tlfc_active_household cookie. Server validates the membership belongs to
 * the calling user — forging the cookie can't gain access to a household
 * the user isn't already a member of.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await getSession();
    if (!ctx) return jsonError("Not authenticated", 401);
    await assertEmailVerifiedForAppAccess(ctx.user);

    const body = bodySchema.parse(await req.json());
    const cookieStore = await cookies();

    if (body.membershipId === null) {
      cookieStore.set(clearActiveHouseholdCookie());
      return jsonOk({ ok: true, cleared: true });
    }

    const target = ctx.memberships.find((m) => m.id === body.membershipId);
    if (!target) {
      return jsonError("You aren't a member of that household", 404);
    }

    cookieStore.set(buildActiveHouseholdCookie(target.id));

    await writeAudit({
      action: "update",
      userId: ctx.user.id,
      householdId: target.householdId,
      resourceType: "active_household",
      resourceId: target.id,
      ipHash: ipHashFromHeaders(req.headers)
    });

    return jsonOk({
      ok: true,
      household: {
        id: target.household.id,
        name: target.household.name,
        baseCurrency: target.household.baseCurrency
      }
    });
  } catch (err) {
    return handleApiError(err);
  }
}
