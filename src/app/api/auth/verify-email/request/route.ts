import type { NextRequest } from "next/server";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getSession, ipHashFromHeaders } from "@/lib/auth";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { writeAudit } from "@/lib/audit";
import { log } from "@/lib/logger";
import { sendMail } from "@/lib/mailer";
import { loadAdminConfig } from "@/lib/admin-config";
import { assertAuditRateLimit } from "@/lib/rate-limit";

const VERIFY_TTL_HOURS = 24;

/**
 * POST /api/auth/verify-email/request
 *
 * Issue a verification token for the currently signed-in user and email it.
 * Idempotent — calling repeatedly invalidates older outstanding tokens by
 * letting them expire naturally; we don't proactively delete because that
 * adds churn for no real benefit.
 *
 * Anonymous calls aren't allowed: the user has to be in a session (signup
 * flow keeps you signed in even when verification is required, just gated
 * out of the rest of the app — see signin gate).
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await getSession();
    if (!ctx) return jsonError("Not authenticated", 401);
    if (ctx.user.emailVerifiedAt) {
      return jsonOk({ ok: true, alreadyVerified: true });
    }
    const cfg = await loadAdminConfig();
    const ipHash = ipHashFromHeaders(req.headers);
    await assertAuditRateLimit({
      action: "email_verification_request",
      ipHash,
      userId: ctx.user.id,
      windowMs: 60 * 60 * 1000,
      max: cfg.authConfig.maxEmailVerificationRequestsPerHour,
      message: "Too many verification email requests — please try again later"
    });

    const token = randomToken(32);
    const tokenHash = sha256Hex(token);
    const expiresAt = new Date(
      Date.now() + VERIFY_TTL_HOURS * 60 * 60 * 1000
    );

    await prisma.emailVerificationToken.create({
      data: { tokenHash, userId: ctx.user.id, expiresAt }
    });

    const verifyUrl = `${getOrigin(req)}/verify-email/${token}`;

    const result = await sendMail({
      to: ctx.user.email,
      subject: "Verify your TL Finance Core email address",
      text:
        `Hi,\n\n` +
        `Confirm this email address belongs to you by opening the link ` +
        `below within ${VERIFY_TTL_HOURS} hours:\n\n` +
        `${verifyUrl}\n\n` +
        `If you didn't sign up, you can ignore this message.`
    });
    if (!result.delivered) {
      log.warn("email verification: mail not delivered", {
        userId: ctx.user.id,
        reason: result.reason,
        verifyUrl
      });
    }

    await writeAudit({
      action: "email_verification_request",
      userId: ctx.user.id,
      ipHash,
      metadata: { ttlHours: VERIFY_TTL_HOURS }
    });

    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

function getOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("host") || "localhost";
  return `${proto}://${host}`;
}
