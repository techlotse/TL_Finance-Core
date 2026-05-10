import type { NextRequest } from "next/server";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { sha256Hex } from "@/lib/crypto";
import { writeAudit } from "@/lib/audit";
import { ipHashFromHeaders } from "@/lib/auth";

/**
 * POST /api/auth/verify-email/[token]
 *
 * Consume a verification token: stamp emailVerifiedAt on the linked user,
 * mark the token consumed. Tokens are single-use and short-lived; the route
 * accepts both authenticated and anonymous calls — clicking the link from
 * a fresh browser tab still completes verification.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!token || token.length < 10) {
      return jsonError("Invalid token", 400);
    }
    const ipHash = ipHashFromHeaders(req.headers);
    const tokenHash = sha256Hex(token);

    const row = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: true }
    });
    if (!row) return jsonError("Invalid or expired link", 400);
    if (row.consumedAt) return jsonError("Link already used", 400);
    if (row.expiresAt.getTime() < Date.now()) {
      return jsonError("Link has expired — request a new one", 400);
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: row.userId },
        data: { emailVerifiedAt: new Date() }
      }),
      prisma.emailVerificationToken.update({
        where: { id: row.id },
        data: { consumedAt: new Date() }
      })
    ]);

    await writeAudit({
      action: "email_verified",
      userId: row.userId,
      ipHash
    });

    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
