import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, jsonOk, serialize } from "@/lib/api";
import { budgetItemPatchSchema } from "@/lib/schemas";
import { getActiveHouseholdId } from "@/lib/household";
import {
  OwnershipError,
  assertBudgetItemFkOwnership
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
    const body = budgetItemPatchSchema.parse(await req.json());

    await assertBudgetItemFkOwnership(householdId, {
      categoryId: body.categoryId,
      accountId: body.accountId ?? undefined,
      incomeEarnerId: body.incomeEarnerId ?? undefined
    });

    const updated = await prisma.$transaction(async (tx) => {
      const found = await tx.budgetLineItem.findFirst({
        where: { id, householdId },
        select: { id: true }
      });
      if (!found) throw new OwnershipError("Budget item not found", 404);
      return tx.budgetLineItem.update({
        where: { id },
        data: {
          ...body,
          startDate: body.startDate ? new Date(body.startDate) : undefined,
          endDate:
            body.endDate === undefined
              ? undefined
              : body.endDate === null
                ? null
                : new Date(body.endDate)
        }
      });
    });

    await writeAudit({
      action: "update",
      householdId,
      resourceType: "budget_item",
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
      const result = await prisma.budgetLineItem.deleteMany({
        where: { id, householdId }
      });
      if (result.count === 0) throw new OwnershipError("Budget item not found", 404);
      await writeAudit({
        action: "delete",
        householdId,
        resourceType: "budget_item",
        resourceId: id,
        ipHash: ipHashFromHeaders(req.headers)
      });
      return jsonOk({ ok: true, deleted: true });
    }

    // Soft-delete: set both active=false and deletedAt so historical
    // reports can still find the row but live filters skip it.
    const result = await prisma.budgetLineItem.updateMany({
      where: { id, householdId, deletedAt: null },
      data: { active: false, deletedAt: new Date() }
    });
    if (result.count === 0) throw new OwnershipError("Budget item not found", 404);

    await writeAudit({
      action: "soft_delete",
      householdId,
      resourceType: "budget_item",
      resourceId: id,
      ipHash: ipHashFromHeaders(req.headers)
    });

    const after = await prisma.budgetLineItem.findUniqueOrThrow({ where: { id } });
    return jsonOk(serialize(after));
  } catch (err) {
    return handleApiError(err);
  }
}
