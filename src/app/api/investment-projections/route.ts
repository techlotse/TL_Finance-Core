import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveHouseholdId } from "@/lib/household";
import { handleApiError, jsonOk, serialize } from "@/lib/api";
import { investmentProjectionCreateSchema } from "@/lib/schemas";
import { assertAccountOwnership } from "@/lib/ownership";
import { writeAudit } from "@/lib/audit";
import { ipHashFromHeaders } from "@/lib/auth";

export async function GET() {
  try {
    const householdId = await getActiveHouseholdId();
    const projections = await prisma.investmentProjection.findMany({
      where: { householdId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: { account: true }
    });
    return jsonOk(serialize(projections));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const householdId = await getActiveHouseholdId();
    const body = investmentProjectionCreateSchema.parse(await req.json());

    if (body.accountId) {
      await assertAccountOwnership(householdId, body.accountId);
    }

    const created = await prisma.investmentProjection.create({
      data: {
        householdId,
        name: body.name,
        startingCapital: body.startingCapital,
        currency: body.currency,
        recurringContribution: body.recurringContribution,
        contributionFrequency: body.contributionFrequency,
        expectedAnnualReturn: body.expectedAnnualReturn,
        annualFeeDrag: body.annualFeeDrag ?? "0",
        inflationRate: body.inflationRate ?? "0",
        horizonYears: body.horizonYears,
        accountId: body.accountId ?? null
      }
    });

    await writeAudit({
      action: "create",
      householdId,
      resourceType: "investment_projection",
      resourceId: created.id,
      ipHash: ipHashFromHeaders(req.headers)
    });

    return jsonOk(serialize(created), { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
