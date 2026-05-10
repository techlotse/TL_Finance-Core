import type { NextRequest } from "next/server";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { completePasswordResetSchema } from "@/lib/schemas";
import { prisma } from "@/lib/prisma";
import {
  destroyAllSessionsForUser,
  hashPassword,
  ipHashFromHeaders
} from "@/lib/auth";
import { sha256Hex } from "@/lib/crypto";
import { writeAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const body = completePasswordResetSchema.parse(await req.json());
    const tokenHash = sha256Hex(body.token);

    const tokenRow = await prisma.passwordResetToken.findUnique({
      where: { tokenHash }
    });
    if (!tokenRow || tokenRow.consumedAt || tokenRow.expiresAt < new Date()) {
      return jsonError("Reset link is invalid or has expired", 400);
    }

    const newHash = await hashPassword(body.password);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: tokenRow.userId },
        data: { passwordHash: newHash }
      }),
      prisma.passwordResetToken.update({
        where: { id: tokenRow.id },
        data: { consumedAt: new Date() }
      })
    ]);

    // Belt & braces: nuke any existing sessions so a stolen cookie can't
    // ride on past a password reset.
    await destroyAllSessionsForUser(tokenRow.userId);

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
