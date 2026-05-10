import { getSession } from "./auth";
import { assertEmailVerifiedForAppAccess } from "./auth-policy";
import type { Household } from "@prisma/client";

/**
 * Household resolution. The whole rest of the codebase asks for the active
 * household through these helpers, so swapping in real auth (now done) means
 * one file changed instead of every Prisma call site.
 *
 * Resolution order:
 *   1. Session cookie → User → first HouseholdMember → Household.
 *   2. If the user has no membership yet, callers should redirect to
 *      `/onboarding`. Server pages do this; API routes throw 404.
 *
 * Anonymous requests never resolve here — middleware blocks them before they
 * reach the helpers. The throwing variants exist for defence-in-depth.
 */

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "HttpError";
  }
}

/**
 * Returns the household the current session is bound to, or null if the user
 * has not yet completed onboarding. Throws 401 if there is no session at all.
 */
export async function getActiveHousehold(): Promise<Household> {
  const ctx = await getSession();
  if (!ctx) throw new HttpError(401, "Not authenticated");
  await assertEmailVerifiedForAppAccess(ctx.user);
  if (!ctx.membership) throw new HttpError(409, "Household setup required");
  return ctx.membership.household;
}

export async function getActiveHouseholdId(): Promise<string> {
  const household = await getActiveHousehold();
  return household.id;
}

/**
 * Same as getActiveHousehold but returns null instead of throwing when no
 * membership exists yet. Used by the onboarding flow.
 */
export async function getActiveHouseholdOrOnboarding(): Promise<{
  status: "ok";
  household: Household;
} | { status: "needs-onboarding"; userId: string }> {
  const ctx = await getSession();
  if (!ctx) throw new HttpError(401, "Not authenticated");
  await assertEmailVerifiedForAppAccess(ctx.user);
  if (!ctx.membership) {
    return { status: "needs-onboarding", userId: ctx.user.id };
  }
  return { status: "ok", household: ctx.membership.household };
}

/**
 * Returns the role of the current user in the active household. Used for
 * future "viewer" vs "editor" distinctions inside a household — for now we
 * only have owner / member with identical permissions.
 */
export async function getActiveMembershipRole(): Promise<"owner" | "member"> {
  const ctx = await getSession();
  if (!ctx?.membership) throw new HttpError(401, "Not authenticated");
  await assertEmailVerifiedForAppAccess(ctx.user);
  return ctx.membership.role;
}
