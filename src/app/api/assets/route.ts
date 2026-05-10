import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, jsonOk, serialize } from "@/lib/api";
import { getActiveHouseholdId } from "@/lib/household";
import { assetCreateSchema } from "@/lib/schemas";
import { writeAudit } from "@/lib/audit";
import { ipHashFromHeaders } from "@/lib/auth";

export async function GET() {
  try {
    const householdId = await getActiveHouseholdId();
    const assets = await prisma.asset.findMany({
      where: { householdId, deletedAt: null },
      orderBy: { createdAt: "asc" }
    });
    return jsonOk(serialize(assets));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const householdId = await getActiveHouseholdId();
    const body = assetCreateSchema.parse(await req.json());

    const created = await prisma.asset.create({
      data: {
        householdId,
        name: body.name,
        category: body.category,
        value: body.value,
        currency: body.currency,
        annualAppreciationRate: body.annualAppreciationRate,
        acquiredAt: body.acquiredAt ? new Date(body.acquiredAt) : null,
        notes: body.notes ?? null,
        active: body.active ?? true
      }
    });

    await writeAudit({
      action: "create",
      householdId,
      resourceType: "asset",
      resourceId: created.id,
      ipHash: ipHashFromHeaders(req.headers)
    });

    return jsonOk(serialize(created), { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
