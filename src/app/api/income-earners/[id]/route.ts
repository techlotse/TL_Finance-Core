import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, jsonError, jsonOk, serialize } from "@/lib/api";
import { incomeEarnerPatchSchema } from "@/lib/schemas";
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
    const body = incomeEarnerPatchSchema.parse(await req.json());

    const updated = await prisma.$transaction(async (tx) => {
      const found = await tx.incomeEarner.findFirst({
        where: { id, householdId },
        select: { id: true }
      });
      if (!found) throw new OwnershipError("Income earner not found", 404);
      return tx.incomeEarner.update({ where: { id }, data: body });
    });

    await writeAudit({
      action: "update",
      householdId,
      resourceType: "income_earner",
      resourceId: id,
      ipHash: ipHashFromHeaders(req.headers)
    });

    return jsonOk(serialize(updated));
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * Soft-delete by default. Hard delete (?force=true) only when no budget item
 * still tags this earner — otherwise income split charts lose attribution.
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

    const found = await prisma.incomeEarner.findFirst({
      where: { id, householdId },
      select: { id: true }
    });
    if (!found) throw new OwnershipError("Income earner not found", 404);

    if (force) {
      const usage = await prisma.budgetLineItem.count({
        where: { incomeEarnerId: id }
      });
      if (usage > 0) {
        return jsonError(
          "Income earner referenced by budget items — soft-delete instead",
          409
        );
      }
      await prisma.incomeEarner.deleteMany({
        where: { id, householdId }
      });

      await writeAudit({
        action: "delete",
        householdId,
        resourceType: "income_earner",
        resourceId: id,
        ipHash: ipHashFromHeaders(req.headers)
      });
      return jsonOk({ ok: true, deleted: true });
    }

    const result = await prisma.incomeEarner.updateMany({
      where: { id, householdId, deletedAt: null },
      data: { active: false, deletedAt: new Date() }
    });
    if (result.count === 0)
      throw new OwnershipError("Income earner not found", 404);

    await writeAudit({
      action: "soft_delete",
      householdId,
      resourceType: "income_earner",
      resourceId: id,
      ipHash: ipHashFromHeaders(req.headers)
    });

    const after = await prisma.incomeEarner.findUniqueOrThrow({ where: { id } });
    return jsonOk(serialize(after));
  } catch (err) {
    return handleApiError(err);
  }
}
