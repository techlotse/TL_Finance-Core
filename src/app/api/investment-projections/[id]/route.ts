import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, jsonOk, serialize } from "@/lib/api";
import { investmentProjectionPatchSchema } from "@/lib/schemas";
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
    const body = investmentProjectionPatchSchema.parse(await req.json());

    const updated = await prisma.$transaction(async (tx) => {
      const found = await tx.investmentProjection.findFirst({
        where: { id, householdId },
        select: { id: true }
      });
      if (!found) throw new OwnershipError("Projection not found", 404);
      return tx.investmentProjection.update({ where: { id }, data: body });
    });

    await writeAudit({
      action: "update",
      householdId,
      resourceType: "investment_projection",
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
      const result = await prisma.investmentProjection.deleteMany({
        where: { id, householdId }
      });
      if (result.count === 0)
        throw new OwnershipError("Projection not found", 404);
      await writeAudit({
        action: "delete",
        householdId,
        resourceType: "investment_projection",
        resourceId: id,
        ipHash: ipHashFromHeaders(req.headers)
      });
      return jsonOk({ ok: true, deleted: true });
    }

    const result = await prisma.investmentProjection.updateMany({
      where: { id, householdId, deletedAt: null },
      data: { active: false, deletedAt: new Date() }
    });
    if (result.count === 0)
      throw new OwnershipError("Projection not found", 404);

    await writeAudit({
      action: "soft_delete",
      householdId,
      resourceType: "investment_projection",
      resourceId: id,
      ipHash: ipHashFromHeaders(req.headers)
    });

    const after = await prisma.investmentProjection.findUniqueOrThrow({
      where: { id }
    });
    return jsonOk(serialize(after));
  } catch (err) {
    return handleApiError(err);
  }
}
