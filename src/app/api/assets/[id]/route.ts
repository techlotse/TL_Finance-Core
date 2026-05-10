import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, jsonOk, serialize } from "@/lib/api";
import { assetPatchSchema } from "@/lib/schemas";
import { getActiveHouseholdId } from "@/lib/household";
import { OwnershipError } from "@/lib/ownership";
import { writeAudit } from "@/lib/audit";
import { ipHashFromHeaders } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const householdId = await getActiveHouseholdId();
    const { id } = await params;
    const body = assetPatchSchema.parse(await req.json());

    const updated = await prisma.$transaction(async (tx) => {
      const found = await tx.asset.findFirst({
        where: { id, householdId },
        select: { id: true }
      });
      if (!found) throw new OwnershipError("Asset not found", 404);
      return tx.asset.update({
        where: { id },
        data: {
          ...body,
          acquiredAt:
            body.acquiredAt === undefined
              ? undefined
              : body.acquiredAt === null
                ? null
                : new Date(body.acquiredAt)
        }
      });
    });

    await writeAudit({
      action: "update",
      householdId,
      resourceType: "asset",
      resourceId: id,
      ipHash: ipHashFromHeaders(req.headers)
    });

    return jsonOk(serialize(updated));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const householdId = await getActiveHouseholdId();
    const { id } = await params;
    const url = new URL(req.url);
    const force = url.searchParams.get("force") === "true";

    if (force) {
      const result = await prisma.asset.deleteMany({
        where: { id, householdId }
      });
      if (result.count === 0) throw new OwnershipError("Asset not found", 404);
      await writeAudit({
        action: "delete",
        householdId,
        resourceType: "asset",
        resourceId: id,
        ipHash: ipHashFromHeaders(req.headers)
      });
      return jsonOk({ ok: true, deleted: true });
    }

    const result = await prisma.asset.updateMany({
      where: { id, householdId, deletedAt: null },
      data: { active: false, deletedAt: new Date() }
    });
    if (result.count === 0) throw new OwnershipError("Asset not found", 404);

    await writeAudit({
      action: "soft_delete",
      householdId,
      resourceType: "asset",
      resourceId: id,
      ipHash: ipHashFromHeaders(req.headers)
    });

    const after = await prisma.asset.findUniqueOrThrow({ where: { id } });
    return jsonOk(serialize(after));
  } catch (err) {
    return handleApiError(err);
  }
}
