import type { NextRequest } from "next/server";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { signupSchema } from "@/lib/schemas";
import { prisma } from "@/lib/prisma";
import {
  buildSessionCookie,
  createSession,
  hashPassword,
  ipHashFromHeaders,
  normaliseEmail
} from "@/lib/auth";
import { loadAdminConfig } from "@/lib/admin-config";
import { writeAudit } from "@/lib/audit";
import { cookies } from "next/headers";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { sendMail } from "@/lib/mailer";
import { log } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const cfg = await loadAdminConfig();
    if (!cfg.authConfig.signupEnabled) {
      return jsonError("Sign-up is currently disabled by the administrator", 403);
    }

    const body = signupSchema.parse(await req.json());
    const email = normaliseEmail(body.email);
    const ipHash = ipHashFromHeaders(req.headers);

    // Pre-check existence to give a friendly message — but we still write
    // through Prisma's unique index for the actual race-safe guard.
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return jsonError("An account with that email already exists", 409);
    }

    const passwordHash = await hashPassword(body.password);

    // First-ever user becomes admin so the instance can configure itself.
    const userCount = await prisma.user.count();
    const role = userCount === 0 ? "admin" : "user";

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role,
        productTier: body.productTier,
        // If email verification is required by config, leave emailVerifiedAt null;
        // the user will be redirected to a "verify your email" gate. For now
        // (no mail provider yet) we auto-verify so the wizard can run.
        emailVerifiedAt: cfg.authConfig.emailVerificationRequired ? null : new Date()
      }
    });

    const { token, expiresAt } = await createSession(user.id, {
      ttlDays: cfg.authConfig.sessionTtlDays,
      userAgent: req.headers.get("user-agent"),
      ipHash
    });

    const cookieStore = await cookies();
    const cookie = buildSessionCookie(token, expiresAt);
    cookieStore.set(cookie);

    await writeAudit({
      action: "signup",
      userId: user.id,
      ipHash,
      metadata: { productTier: body.productTier, role }
    });

    // If verification is required by admin config, issue a token + send the
    // mail right away. The session is still created so the user can request
    // another verification link, but app pages/APIs stay gated until they
    // verify.
    if (cfg.authConfig.emailVerificationRequired) {
      const vToken = randomToken(32);
      const vTokenHash = sha256Hex(vToken);
      const vExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await prisma.emailVerificationToken.create({
        data: { tokenHash: vTokenHash, userId: user.id, expiresAt: vExpires }
      });
      const proto = req.headers.get("x-forwarded-proto") || "https";
      const host = req.headers.get("host") || "localhost";
      const verifyUrl = `${proto}://${host}/verify-email/${vToken}`;
      const result = await sendMail({
        to: user.email,
        subject: "Verify your TL Finance Core email address",
        text:
          `Welcome.\n\nConfirm this email belongs to you within 24 hours:\n\n` +
          `${verifyUrl}\n`
      });
      if (!result.delivered) {
        log.warn("signup: verification mail not delivered", {
          userId: user.id,
          reason: result.reason,
          verifyUrl
        });
      }
      return jsonOk({
        ok: true,
        user: { id: user.id, email: user.email, role: user.role },
        next: "/verify-email",
        verificationRequired: true
      });
    }

    return jsonOk({
      ok: true,
      user: { id: user.id, email: user.email, role: user.role },
      next: "/onboarding"
    });
  } catch (err) {
    return handleApiError(err);
  }
}
