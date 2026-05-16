import { NextRequest } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { handleApiError, jsonOk } from "@/lib/api";
import { adminUserAccessSelect, toAdminUserAccess } from "@/lib/admin-users";
import { requireAdminApi } from "@/lib/admin-guard";
import { writeAudit } from "@/lib/audit";
import { ipHashFromHeaders } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { adminUserAccessPatchSchema } from "@/lib/schemas";

function httpError(message: string, status: number) {
  const err = new Error(message) as Error & { status?: number };
  err.status = status;
  return err;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAdminApi();
    const { id } = await params;
    const body = adminUserAccessPatchSchema.parse(await req.json());

    const { existing, updated } = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.user.findUnique({
          where: { id },
          select: adminUserAccessSelect
        });
        if (!existing) throw httpError("User not found", 404);

        if (body.active === false && existing.role === "admin") {
          const activeAdminCount = await tx.user.count({
            where: {
              role: "admin",
              active: true,
              id: { not: id }
            }
          });
          if (activeAdminCount === 0) {
            throw httpError("At least one active admin account is required", 409);
          }
        }

        const updated = await tx.user.update({
          where: { id },
          data: {
            ...(body.productTier !== undefined
              ? { productTier: body.productTier }
              : {}),
            ...(body.active !== undefined ? { active: body.active } : {})
          },
          select: adminUserAccessSelect
        });

        return { existing, updated };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      }
    );

    await writeAudit({
      action: "admin_user_access_update",
      userId: ctx.user.id,
      resourceType: "user",
      resourceId: id,
      ipHash: ipHashFromHeaders(req.headers),
      metadata: {
        email: existing.email,
        before: {
          productTier: existing.productTier,
          active: existing.active
        },
        after: {
          productTier: updated.productTier,
          active: updated.active
        }
      }
    });

    return jsonOk({ ok: true, user: toAdminUserAccess(updated) });
  } catch (err) {
    return handleApiError(err);
  }
}
