import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import type { User, HouseholdMember, Household } from "@/generated/prisma/client";
import { prisma } from "./prisma";
import { sha256Hex, randomToken } from "./crypto";
import { SESSION_COOKIE } from "./auth-shared";

export { SESSION_COOKIE };
const DEFAULT_TTL_DAYS = 30;
export const MIN_PASSWORD_LENGTH = 10;

// ---------- password hashing ----------

export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  // Cost 12 ≈ 250 ms on commodity hardware — slow enough to throttle brute
  // force, fast enough not to noticeably affect signin UX.
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ---------- session ----------

export interface SessionContext {
  user: User;
  /** The currently *selected* membership (active-household cookie or first). */
  membership?: HouseholdMember & { household: Household };
  /** Every membership the user has — surfaces multi-household pickers. */
  memberships: Array<HouseholdMember & { household: Household }>;
}

export async function createSession(
  userId: string,
  opts: {
    ttlDays?: number;
    userAgent?: string | null;
    ipHash?: string | null;
  } = {}
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(32);
  const tokenHash = sha256Hex(token);
  const ttl = opts.ttlDays ?? DEFAULT_TTL_DAYS;
  const expiresAt = new Date(Date.now() + ttl * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: {
      tokenHash,
      userId,
      expiresAt,
      userAgent: opts.userAgent ?? null,
      ipHash: opts.ipHash ?? null
    }
  });
  return { token, expiresAt };
}

export async function destroySessionByToken(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: sha256Hex(token) } });
}

export async function destroyAllSessionsForUser(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

export async function readSessionFromToken(
  token: string | null | undefined
): Promise<SessionContext | null> {
  if (!token) return null;
  const tokenHash = sha256Hex(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: {
          memberships: {
            include: { household: true },
            orderBy: { createdAt: "asc" }
            // Fetch ALL memberships so the household switcher has the full
            // list. Active selection is resolved against this set further
            // down (see getSession below).
          }
        }
      }
    }
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => null);
    return null;
  }
  if (!session.user.active) return null;

  // Touch lastSeenAt at most every 5 minutes to avoid update-storms on busy reads.
  const fiveMin = 5 * 60 * 1000;
  if (Date.now() - session.lastSeenAt.getTime() > fiveMin) {
    await prisma.session
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch(() => null);
  }

  // Default selection — first membership by createdAt. The active-household
  // cookie can override this, but we apply that override in getSession()
  // (which has access to next/headers) rather than here.
  const memberships = session.user.memberships.map((m) => ({
    ...m,
    household: m.household
  }));
  const membership = memberships[0];
  return {
    user: session.user,
    memberships,
    membership: membership
  };
}

/** Read the current session from cookies. Server-only. */
export async function getSession(): Promise<SessionContext | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const ctx = await readSessionFromToken(token);
  if (!ctx) return ctx;

  // Apply active-household cookie override. We only respect it if the
  // user actually has a matching membership — otherwise an attacker who
  // forges the cookie still can't access another household.
  const activeMembershipId = cookieStore.get("tlfc_active_household")?.value;
  if (activeMembershipId) {
    const picked = ctx.memberships.find((m) => m.id === activeMembershipId);
    if (picked) {
      return { ...ctx, membership: picked };
    }
  }
  return ctx;
}

/** As `getSession`, but throws a 401-shaped Error when missing. */
export async function requireSession(): Promise<SessionContext> {
  const ctx = await getSession();
  if (!ctx) {
    const err = new Error("Not authenticated") as Error & { status?: number };
    err.status = 401;
    throw err;
  }
  return ctx;
}

export interface CookieDescriptor {
  name: string;
  value: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax" | "strict" | "none";
  path: string;
  expires: Date;
}

export function buildSessionCookie(token: string, expiresAt: Date): CookieDescriptor {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt
  };
}

export function clearSessionCookie(): CookieDescriptor {
  return {
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0)
  };
}

// ---------- IP hashing for audit/rate-limit (no PII at rest) ----------

export function ipHashFromHeaders(h: Headers): string | null {
  const xff = h.get("x-forwarded-for");
  const ip = (xff?.split(",")[0]?.trim()) || h.get("x-real-ip") || null;
  if (!ip) return null;
  // Truncated hash — enough to correlate per session, not enough to reverse.
  return sha256Hex(ip).slice(0, 16);
}

// ---------- email normalisation ----------

export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
