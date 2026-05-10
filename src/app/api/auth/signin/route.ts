import type { NextRequest } from "next/server";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { signinSchema } from "@/lib/schemas";
import { prisma } from "@/lib/prisma";
import {
  buildSessionCookie,
  createSession,
  ipHashFromHeaders,
  normaliseEmail,
  verifyPassword
} from "@/lib/auth";
import { loadAdminConfig } from "@/lib/admin-config";
import { writeAudit } from "@/lib/audit";
import { cookies } from "next/headers";

const GENERIC_FAIL = "Email or password is incorrect";

export async function POST(req: NextRequest) {
  try {
    const cfg = await loadAdminConfig();
    const body = signinSchema.parse(await req.json());
    const email = normaliseEmail(body.email);
    const ipHash = ipHashFromHeaders(req.headers);

    // Rate-limit: count signin_failed events from this ipHash in the last
    // hour. Above the configured threshold the request is rejected outright
    // before we even hit bcrypt — keeps brute-force cost on the attacker.
    if (ipHash) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentFails = await prisma.auditLog.count({
        where: {
          action: "signin_failed",
          ipHash,
          ts: { gte: oneHourAgo }
        }
      });
      if (recentFails >= cfg.authConfig.maxFailedSignins) {
        return jsonError(
          "Too many failed sign-in attempts — please try again later",
          429
        );
      }
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          select: { householdId: true },
          take: 1
        }
      }
    });

    if (!user || !user.active) {
      // Same response whether the user exists or not — don't leak existence.
      await writeAudit({
        action: "signin_failed",
        userId: user?.id ?? null,
        ipHash,
        metadata: { email, reason: user ? "inactive" : "unknown" }
      });
      return jsonError(GENERIC_FAIL, 401);
    }

    const ok = await verifyPassword(body.password, user.passwordHash);
    if (!ok) {
      await writeAudit({
        action: "signin_failed",
        userId: user.id,
        ipHash,
        metadata: { email, reason: "bad_password" }
      });
      return jsonError(GENERIC_FAIL, 401);
    }

    if (
      cfg.authConfig.emailVerificationRequired &&
      !user.emailVerifiedAt
    ) {
      return jsonError("Please verify your email before signing in", 403);
    }

    const { token, expiresAt } = await createSession(user.id, {
      ttlDays: cfg.authConfig.sessionTtlDays,
      userAgent: req.headers.get("user-agent"),
      ipHash
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { lastSignInAt: new Date() }
    });

    const cookieStore = await cookies();
    cookieStore.set(buildSessionCookie(token, expiresAt));

    await writeAudit({
      action: "signin",
      userId: user.id,
      ipHash
    });

    const next = user.memberships.length > 0 ? "/" : "/onboarding";

    return jsonOk({
      ok: true,
      user: { id: user.id, email: user.email, role: user.role },
      next
    });
  } catch (err) {
    return handleApiError(err);
  }
}
