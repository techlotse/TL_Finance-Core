import type { NextRequest } from "next/server";
import { handleApiError, jsonOk } from "@/lib/api";
import { requestPasswordResetSchema } from "@/lib/schemas";
import { prisma } from "@/lib/prisma";
import { ipHashFromHeaders, normaliseEmail } from "@/lib/auth";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { loadAdminConfig } from "@/lib/admin-config";
import { writeAudit } from "@/lib/audit";
import { log } from "@/lib/logger";
import { sendMail } from "@/lib/mailer";
import { assertAuditRateLimit } from "@/lib/rate-limit";
import { publicAppOrigin } from "@/lib/request-origin";

const RESET_TTL_HOURS = 2;

/**
 * Request a password-reset link. We always return 200 regardless of whether
 * the email matches an account, to avoid leaking which addresses are
 * registered. The reset link itself is delivered via the configured mail
 * provider; if mail is not yet configured, the token is logged at warn level
 * (and to the audit log) so the operator can hand it over manually.
 */
export async function POST(req: NextRequest) {
  try {
    const cfg = await loadAdminConfig();
    const body = requestPasswordResetSchema.parse(await req.json());
    const email = normaliseEmail(body.email);
    const ipHash = ipHashFromHeaders(req.headers);
    await assertAuditRateLimit({
      action: "password_reset_request",
      ipHash,
      windowMs: 60 * 60 * 1000,
      max: cfg.authConfig.maxPasswordResetRequestsPerHour,
      message: "Too many password-reset requests — please try again later"
    });

    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const token = randomToken(32);
      const tokenHash = sha256Hex(token);
      const expiresAt = new Date(
        Date.now() + RESET_TTL_HOURS * 60 * 60 * 1000
      );
      await prisma.passwordResetToken.create({
        data: { tokenHash, userId: user.id, expiresAt }
      });

      const resetUrl = `${publicAppOrigin(req.headers)}/reset-password/${token}`;

      // Always attempt to send. Mailer falls back to stdout-log when no
      // provider is configured — keeps the dev / first-boot loop visible
      // without fragmenting the call site.
      const result = await sendMail({
        to: user.email,
        subject: "Reset your TL Finance Core password",
        text:
          `We received a password-reset request for this email.\n\n` +
          `Open the link below within ${RESET_TTL_HOURS} hours to choose a new password:\n\n` +
          `${resetUrl}\n\n` +
          `If you didn't ask for this, ignore this message — your account stays unchanged.`
      });
      if (!result.delivered) {
        log.warn("password reset: mail not delivered", {
          userId: user.id,
          reason: result.reason,
          // Never put bearer reset links in production logs.
          ...(process.env.NODE_ENV === "production" ? {} : { resetUrl })
        });
      }
      // cfg is still read for visibility into provider state in audit metadata.
      void cfg;

      await writeAudit({
        action: "password_reset_request",
        userId: user.id,
        ipHash,
        metadata: { ttlHours: RESET_TTL_HOURS }
      });
    } else {
      // Sleep-equivalent: still write an audit so timing/count attacks are
      // less informative.
      await writeAudit({
        action: "password_reset_request",
        ipHash,
        metadata: { email, found: false }
      });
    }

    return jsonOk({
      ok: true,
      message: "If that account exists, a reset link has been sent."
    });
  } catch (err) {
    return handleApiError(err);
  }
}
