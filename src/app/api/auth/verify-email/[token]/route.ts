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
    const now = new Date();

    const row = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: true }
    });
    if (!row) return jsonError("Invalid or expired link", 400);
    if (row.consumedAt) return jsonError("Link already used", 400);
    if (row.expiresAt < now) {
      return jsonError("Link has expired — request a new one", 400);
    }

    const consumed = await prisma.$transaction(async (tx) => {
      const updated = await tx.emailVerificationToken.updateMany({
        where: { id: row.id, consumedAt: null, expiresAt: { gte: now } },
        data: { consumedAt: now }
      });
      if (updated.count !== 1) return false;
      await tx.user.update({
        where: { id: row.userId },
        data: { emailVerifiedAt: now }
      });
      return true;
    });
    if (!consumed) return jsonError("Invalid or expired link", 400);

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
