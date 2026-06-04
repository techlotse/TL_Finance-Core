import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, jsonOk, serialize } from "@/lib/api";
import { ipHashFromHeaders } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { getActiveHouseholdId } from "@/lib/household";
import { transactionPatchSchema } from "@/lib/schemas";
import { OwnershipError, assertCategoryOwnership } from "@/lib/ownership";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const householdId = await getActiveHouseholdId();
    const { id } = await params;
    const body = transactionPatchSchema.parse(await req.json());

    if (body.categoryId) {
      await assertCategoryOwnership(householdId, body.categoryId);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const found = await tx.actualTransaction.findFirst({
        where: { id, householdId },
        select: { id: true }
      });
      if (!found) throw new OwnershipError("Transaction not found", 404);

      return tx.actualTransaction.update({
        where: { id },
        data: {
          categoryId: body.categoryId,
          reviewState: body.reviewState,
          notes: body.notes
        },
        include: {
          account: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, type: true } }
        }
      });
    });

    await writeAudit({
      action: "transaction_update",
      householdId,
      resourceType: "actual_transaction",
      resourceId: id,
      ipHash: ipHashFromHeaders(req.headers),
      metadata: {
        categoryChanged: body.categoryId !== undefined,
        reviewState: body.reviewState ?? null
      }
    });

    return jsonOk(serialize({ ok: true, value: updated }));
  } catch (err) {
    return handleApiError(err);
  }
}
