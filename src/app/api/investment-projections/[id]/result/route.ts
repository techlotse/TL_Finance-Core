import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, jsonOk } from "@/lib/api";
import { projectInvestment, summarizeProjection } from "@/lib/investment";
import { getActiveHouseholdId } from "@/lib/household";
import { OwnershipError } from "@/lib/ownership";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const householdId = await getActiveHouseholdId();
    const { id } = await params;
    const projection = await prisma.investmentProjection.findFirst({
      where: { id, householdId }
    });
    if (!projection) {
      throw new OwnershipError("Projection not found", 404);
    }

    const series = projectInvestment({
      startingCapital: projection.startingCapital,
      recurringContribution: projection.recurringContribution,
      contributionFrequency: projection.contributionFrequency,
      expectedAnnualReturn: projection.expectedAnnualReturn,
      annualFeeDrag: projection.annualFeeDrag,
      inflationRate: projection.inflationRate,
      horizonYears: projection.horizonYears
    });
    const summary = summarizeProjection(series);

    return jsonOk({
      id: projection.id,
      name: projection.name,
      currency: projection.currency,
      summary: {
        totalContributions: summary.totalContributions.toString(),
        finalNominal: summary.finalNominal.toString(),
        finalReal: summary.finalReal.toString(),
        totalReturn: summary.totalReturn.toString()
      },
      // Reduce noise by emitting yearly points only — chart still looks smooth.
      points: series
        .filter((p) => p.monthsElapsed % 12 === 0)
        .map((p) => ({
          year: p.year,
          monthsElapsed: p.monthsElapsed,
          contributions: p.contributions.toString(),
          nominal: p.nominal.toString(),
          real: p.real.toString()
        }))
    });
  } catch (err) {
    return handleApiError(err);
  }
}
