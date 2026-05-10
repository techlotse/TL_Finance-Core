import { redirect } from "next/navigation";
import { getSession, type SessionContext } from "./auth";
import { isEmailVerificationGateActive } from "./auth-policy";
import type { Household } from "@prisma/client";

function signinUrl(next: string): string {
  return `/signin?next=${encodeURIComponent(next)}`;
}

export async function requirePageSession(next = "/"): Promise<SessionContext> {
  const ctx = await getSession();
  if (!ctx) redirect(signinUrl(next));
  if (await isEmailVerificationGateActive(ctx.user)) {
    redirect("/verify-email");
  }
  return ctx;
}

export async function getActiveHouseholdForPage(
  next = "/"
): Promise<Household> {
  const ctx = await requirePageSession(next);
  if (!ctx.membership) redirect("/onboarding");
  return ctx.membership.household;
}

export async function getActiveHouseholdOrOnboardingForPage(
  next = "/"
): Promise<
  | { status: "ok"; household: Household }
  | { status: "needs-onboarding"; userId: string }
> {
  const ctx = await requirePageSession(next);
  if (!ctx.membership) {
    return { status: "needs-onboarding", userId: ctx.user.id };
  }
  return { status: "ok", household: ctx.membership.household };
}

export async function requireAdminPageSession(
  next = "/admin"
): Promise<SessionContext> {
  const ctx = await requirePageSession(next);
  if (ctx.user.role !== "admin") redirect("/");
  return ctx;
}
