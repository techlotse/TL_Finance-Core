import { getSession, requireSession, type SessionContext } from "./auth";
import {
  assertEmailVerifiedForAppAccess,
  isEmailVerificationGateActive
} from "./auth-policy";

/**
 * Server-side admin guard. Throws an HTTP-shaped error so handleApiError
 * surfaces 401/403 cleanly. Use in API routes.
 */
export async function requireAdminApi(): Promise<SessionContext> {
  const ctx = await requireSession();
  await assertEmailVerifiedForAppAccess(ctx.user);
  if (ctx.user.role !== "admin") {
    const err = new Error("Admin access required") as Error & { status?: number };
    err.status = 403;
    throw err;
  }
  return ctx;
}

/**
 * Page-side admin guard. Returns the session if the user is an admin, null
 * otherwise — caller should redirect to /signin or / accordingly.
 */
export async function getAdminSession(): Promise<SessionContext | null> {
  const ctx = await getSession();
  if (!ctx) return null;
  if (await isEmailVerificationGateActive(ctx.user)) return null;
  if (ctx.user.role !== "admin") return null;
  return ctx;
}
