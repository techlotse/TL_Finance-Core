import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveHouseholdId } from "@/lib/household";
import { handleApiError, jsonOk, serialize } from "@/lib/api";
import { transferCreateSchema } from "@/lib/schemas";
import { assertTransferFkOwnership } from "@/lib/ownership";
import { writeAudit } from "@/lib/audit";
import { ipHashFromHeaders } from "@/lib/auth";

export async function GET() {
  try {
    const householdId = await getActiveHouseholdId();
    const transfers = await prisma.scheduledTransfer.findMany({
      where: { householdId, deletedAt: null },
      orderBy: { startDate: "asc" },
      include: { sourceAccount: true, targetAccount: true }
    });
    return jsonOk(serialize(transfers));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const householdId = await getActiveHouseholdId();
    const body = transferCreateSchema.parse(await req.json());

    await assertTransferFkOwnership(householdId, {
      sourceAccountId: body.sourceAccountId,
      targetAccountId: body.targetAccountId
    });

    const created = await prisma.scheduledTransfer.create({
      data: {
        householdId,
        name: body.name,
        sourceAccountId: body.sourceAccountId,
        sourceCurrency: body.sourceCurrency,
        targetAccountId: body.targetAccountId,
        targetCurrency: body.targetCurrency,
        amount: body.amount,
        recurrence: body.recurrence,
        startDate: new Date(body.startDate),
        endDate: body.endDate ? new Date(body.endDate) : null,
        notes: body.notes ?? null,
        active: body.active ?? true
      }
    });

    await writeAudit({
      action: "create",
      householdId,
      resourceType: "transfer",
      resourceId: created.id,
      ipHash: ipHashFromHeaders(req.headers)
    });

    return jsonOk(serialize(created), { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
