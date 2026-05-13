import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, jsonError, jsonOk, serialize } from "@/lib/api";
import { categoryPatchSchema } from "@/lib/schemas";
import { getActiveHouseholdId } from "@/lib/household";
import {
  OwnershipError,
  assertCategoryGroupOwnership
} from "@/lib/ownership";
import { writeAudit } from "@/lib/audit";
import { ipHashFromHeaders } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const householdId = await getActiveHouseholdId();
    const { id } = await params;
    const body = categoryPatchSchema.parse(await req.json());

    if (body.groupId) {
      await assertCategoryGroupOwnership(householdId, body.groupId);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const found = await tx.category.findFirst({
        where: { id, householdId },
        select: { id: true }
      });
      if (!found) throw new OwnershipError("Category not found", 404);
      return tx.category.update({ where: { id }, data: body });
    });

    await writeAudit({
      action: "update",
      householdId,
      resourceType: "category",
      resourceId: id,
      ipHash: ipHashFromHeaders(req.headers)
    });

    return jsonOk(serialize(updated));
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * Delete is soft by default. Hard delete (?force=true) is blocked while any
 * line item still references this category — historical forecast must keep
 * working even on past months.
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

    const found = await prisma.category.findFirst({
      where: { id, householdId },
      select: { id: true }
    });
    if (!found) throw new OwnershipError("Category not found", 404);

    if (force) {
      const usage = await prisma.budgetLineItem.count({
        where: { categoryId: id }
      });
      if (usage > 0) {
        return jsonError(
          "Category referenced by budget items — soft-delete instead",
          409
        );
      }
      await prisma.category.deleteMany({
        where: { id, householdId }
      });

      await writeAudit({
        action: "delete",
        householdId,
        resourceType: "category",
        resourceId: id,
        ipHash: ipHashFromHeaders(req.headers)
      });
      return jsonOk({ ok: true, deleted: true });
    }

    const activeUsage = await prisma.budgetLineItem.count({
      where: { categoryId: id, active: true }
    });
    if (activeUsage > 0) {
      return jsonError(
        "Category in use by active budget items — reassign or deactivate them first",
        409
      );
    }

    const result = await prisma.category.updateMany({
      where: { id, householdId, deletedAt: null },
      data: { active: false, deletedAt: new Date() }
    });
    if (result.count === 0) throw new OwnershipError("Category not found", 404);

    await writeAudit({
      action: "soft_delete",
      householdId,
      resourceType: "category",
      resourceId: id,
      ipHash: ipHashFromHeaders(req.headers)
    });

    const after = await prisma.category.findUniqueOrThrow({ where: { id } });
    return jsonOk(serialize(after));
  } catch (err) {
    return handleApiError(err);
  }
}
