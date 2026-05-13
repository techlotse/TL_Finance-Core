import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, jsonError, jsonOk, serialize } from "@/lib/api";
import { categoryGroupPatchSchema } from "@/lib/schemas";
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
    const body = categoryGroupPatchSchema.parse(await req.json());

    const updated = await prisma.$transaction(async (tx) => {
      const found = await tx.categoryGroup.findFirst({
        where: { id, householdId },
        select: { id: true }
      });
      if (!found) throw new OwnershipError("Category group not found", 404);
      return tx.categoryGroup.update({ where: { id }, data: body });
    });

    await writeAudit({
      action: "update",
      householdId,
      resourceType: "category_group",
      resourceId: id,
      ipHash: ipHashFromHeaders(req.headers)
    });

    return jsonOk(serialize(updated));
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * Soft-delete (active=false + deletedAt). `?force=true` only succeeds if the
 * group has no live categories left — historical line items still need their
 * group lineage to render.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const householdId = await getActiveHouseholdId();
    const { id } = await params;
    const url = new URL(req.url);
    const force = url.searchParams.get("force") === "true";

    const found = await prisma.categoryGroup.findFirst({
      where: { id, householdId },
      select: { id: true }
    });
    if (!found) throw new OwnershipError("Category group not found", 404);

    const remaining = await prisma.category.count({
      where: { groupId: id, deletedAt: null }
    });
    if (remaining > 0) {
      return jsonError(
        "Group still has categories — move or remove them first",
        409
      );
    }

    if (force) {
      // Hard delete only when no category — including soft-deleted — points here.
      const anyRef = await prisma.category.count({ where: { groupId: id } });
      if (anyRef > 0) {
        return jsonError(
          "Group still has historical categories — soft-delete instead",
          409
        );
      }
      await prisma.categoryGroup.deleteMany({
        where: { id, householdId }
      });

      await writeAudit({
        action: "delete",
        householdId,
        resourceType: "category_group",
        resourceId: id,
        ipHash: ipHashFromHeaders(req.headers)
      });
      return jsonOk({ ok: true, deleted: true });
    }

    const result = await prisma.categoryGroup.updateMany({
      where: { id, householdId, deletedAt: null },
      data: { deletedAt: new Date() }
    });
    if (result.count === 0)
      throw new OwnershipError("Category group not found", 404);

    await writeAudit({
      action: "soft_delete",
      householdId,
      resourceType: "category_group",
      resourceId: id,
      ipHash: ipHashFromHeaders(req.headers)
    });

    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
