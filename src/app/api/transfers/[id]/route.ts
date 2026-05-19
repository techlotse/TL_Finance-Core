import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, jsonOk, serialize } from "@/lib/api";
import { transferPatchSchema } from "@/lib/schemas";
import { getActiveHouseholdId } from "@/lib/household";
import { OwnershipError, assertTransferFkOwnership } from "@/lib/ownership";
import { writeAudit } from "@/lib/audit";
import { ipHashFromHeaders } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const householdId = await getActiveHouseholdId();
    const { id } = await params;
    const body = transferPatchSchema.parse(await req.json());

    const existing = await prisma.scheduledTransfer.findFirst({
      where: { id, householdId },
      select: {
        sourceAccountId: true,
        sourceCurrency: true,
        targetAccountId: true,
        targetCurrency: true
      }
    });
    if (!existing) throw new OwnershipError("Transfer not found", 404);

    await assertTransferFkOwnership(householdId, {
      sourceAccountId: body.sourceAccountId ?? existing.sourceAccountId,
      sourceCurrency: body.sourceCurrency ?? existing.sourceCurrency,
      targetAccountId: body.targetAccountId ?? existing.targetAccountId,
      targetCurrency: body.targetCurrency ?? existing.targetCurrency
    });

    const updated = await prisma.$transaction(async (tx) => {
      const found = await tx.scheduledTransfer.findFirst({
        where: { id, householdId },
        select: { id: true }
      });
      if (!found) throw new OwnershipError("Transfer not found", 404);

      return tx.scheduledTransfer.update({
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
      resourceType: "transfer",
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
      const result = await prisma.scheduledTransfer.deleteMany({
        where: { id, householdId }
      });
      if (result.count === 0) throw new OwnershipError("Transfer not found", 404);
      await writeAudit({
        action: "delete",
        householdId,
        resourceType: "transfer",
        resourceId: id,
        ipHash: ipHashFromHeaders(req.headers)
      });
      return jsonOk({ ok: true, deleted: true });
    }

    const result = await prisma.scheduledTransfer.updateMany({
      where: { id, householdId, deletedAt: null },
      data: { active: false, deletedAt: new Date() }
    });
    if (result.count === 0) throw new OwnershipError("Transfer not found", 404);

    await writeAudit({
      action: "soft_delete",
      householdId,
      resourceType: "transfer",
      resourceId: id,
      ipHash: ipHashFromHeaders(req.headers)
    });

    const after = await prisma.scheduledTransfer.findUniqueOrThrow({
      where: { id }
    });
    return jsonOk(serialize(after));
  } catch (err) {
    return handleApiError(err);
  }
}
