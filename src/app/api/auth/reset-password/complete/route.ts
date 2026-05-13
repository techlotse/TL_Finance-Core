import type { NextRequest } from "next/server";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { completePasswordResetSchema } from "@/lib/schemas";
import { prisma } from "@/lib/prisma";
import {
  hashPassword,
  ipHashFromHeaders
} from "@/lib/auth";
import { sha256Hex } from "@/lib/crypto";
import { writeAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const body = completePasswordResetSchema.parse(await req.json());
    const tokenHash = sha256Hex(body.token);
    const now = new Date();

    const tokenRow = await prisma.passwordResetToken.findUnique({
      where: { tokenHash }
    });
    if (!tokenRow || tokenRow.consumedAt || tokenRow.expiresAt < now) {
      return jsonError("Reset link is invalid or has expired", 400);
    }

    const newHash = await hashPassword(body.password);

    const consumed = await prisma.$transaction(async (tx) => {
      const updated = await tx.passwordResetToken.updateMany({
        where: { id: tokenRow.id, consumedAt: null, expiresAt: { gte: now } },
        data: { consumedAt: now }
      });
      if (updated.count !== 1) return false;
      await tx.user.update({
        where: { id: tokenRow.userId },
        data: { passwordHash: newHash }
      });
      await tx.session.deleteMany({ where: { userId: tokenRow.userId } });
      return true;
    });
    if (!consumed) {
      return jsonError("Reset link is invalid or has expired", 400);
    }

    await writeAudit({
      action: "password_reset_complete",
      userId: tokenRow.userId,
      ipHash: ipHashFromHeaders(req.headers)
    });

    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
