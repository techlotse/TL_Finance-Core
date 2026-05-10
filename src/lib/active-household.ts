import { cookies } from "next/headers";

/**
 * Active-household selection.
 *
 * The schema lets one user belong to multiple households (HouseholdMember
 * rows). To pick which household is "active" for the current session we
 * use a small, separate cookie — not the session cookie itself — so flipping
 * households doesn't require re-authenticating, and an attacker who guesses
 * the cookie can still only see households they already have memberships
 * in (the server always re-checks membership before serving data).
 *
 * Cookie name: tlfc_active_household. Value: a HouseholdMember.id (we use
 * the membership id rather than the household id so a future "kicked out"
 * flow naturally invalidates the selection).
 */
export const ACTIVE_HOUSEHOLD_COOKIE = "tlfc_active_household";

export async function readActiveMembershipId(): Promise<string | null> {
  const store = await cookies();
  return store.get(ACTIVE_HOUSEHOLD_COOKIE)?.value ?? null;
}

export interface ActiveHouseholdCookie {
  name: string;
  value: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  // 1 year — selections persist across sessions; users can change at any
  // time via the household switcher in the nav.
  maxAge: number;
}

export function buildActiveHouseholdCookie(
  membershipId: string
): ActiveHouseholdCookie {
  return {
    name: ACTIVE_HOUSEHOLD_COOKIE,
    value: membershipId,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365
  };
}

export function clearActiveHouseholdCookie(): ActiveHouseholdCookie {
  return {
    name: ACTIVE_HOUSEHOLD_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0
  };
}
