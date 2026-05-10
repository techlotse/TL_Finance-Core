import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveHouseholdId } from "@/lib/household";
import { handleApiError, jsonOk, serialize } from "@/lib/api";
import { incomeEarnerCreateSchema } from "@/lib/schemas";
import { writeAudit } from "@/lib/audit";
import { ipHashFromHeaders } from "@/lib/auth";

export async function GET() {
  try {
    const householdId = await getActiveHouseholdId();
    const earners = await prisma.incomeEarner.findMany({
      where: { householdId, deletedAt: null },
      orderBy: { createdAt: "asc" }
    });
    return jsonOk(serialize(earners));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const householdId = await getActiveHouseholdId();
    const body = incomeEarnerCreateSchema.parse(await req.json());
    const created = await prisma.incomeEarner.create({
      data: { ...body, householdId }
    });
    await writeAudit({
      action: "create",
      householdId,
      resourceType: "income_earner",
      resourceId: created.id,
      ipHash: ipHashFromHeaders(req.headers)
    });
    return jsonOk(serialize(created), { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
