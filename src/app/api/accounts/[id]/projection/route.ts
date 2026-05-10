import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { getActiveHouseholdId } from "@/lib/household";
import { OwnershipError } from "@/lib/ownership";
import { projectInvestment, summarizeProjection } from "@/lib/investment";
import { toDecimal } from "@/lib/money";

/**
 * GET /api/accounts/[id]/projection?horizonYears=25
 *
 * Projects an investment-type bank account forward using its
 * `expectedAnnualReturn` and `monthlyManagementCost` fields. The starting
 * capital is the sum of the account's current pocket balances (we project
 * in the account's first currency to keep the chart single-axis); pockets
 * in other currencies are converted only at FX-snapshot time so this is a
 * pragmatic single-currency view. Returns the same shape as the
 * investment-projection result endpoint so the chart component can stay
 * generic.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const householdId = await getActiveHouseholdId();
    const { id: accountId } = await params;
    const url = new URL(req.url);
    const horizonYears = Math.min(
      60,
      Math.max(1, Number(url.searchParams.get("horizonYears") ?? "25"))
    );

    const account = await prisma.bankAccount.findFirst({
      where: { id: accountId, householdId, deletedAt: null },
      include: { currencies: true }
    });
    if (!account) throw new OwnershipError("Account not found", 404);

    if (account.accountType !== "investment") {
      return jsonError(
        "Projection is only available for investment-type accounts",
        400
      );
    }
    if (!account.expectedAnnualReturn) {
      return jsonError(
        "This account has no expected annual return configured",
        400
      );
    }

    // Pick the dominant pocket — usually one currency per investment account.
    // If multiple, sum them all into the dominant currency; user can refine
    // by editing per-pocket balances if needed.
    const dominant = account.currencies[0];
    if (!dominant) {
      return jsonError("Account has no currency pockets", 400);
    }
    const startingCapital = account.currencies.reduce(
      (acc, c) => acc.plus(toDecimal(c.currentBalance)),
      toDecimal(0)
    );

    // Annualise the monthlyManagementCost so projectInvestment can subtract
    // it via the fee drag mechanism: monthlyCost / startingCapital * 12 gives
    // a rough percentage drag, but a flat-fee model isn't perfectly captured.
    // We treat zero-cost as zero drag and approximate by dividing through
    // the *average* balance — for a simple V1 chart this is good enough.
    const avgBalance = startingCapital;
    const annualFeeDrag =
      account.monthlyManagementCost && avgBalance.gt(0)
        ? toDecimal(account.monthlyManagementCost)
            .mul(12)
            .div(avgBalance)
            .toString()
        : "0";

    const series = projectInvestment({
      startingCapital,
      recurringContribution: 0,
      contributionFrequency: "monthly",
      expectedAnnualReturn: account.expectedAnnualReturn,
      annualFeeDrag,
      inflationRate: "0.02",
      horizonYears
    });
    const summary = summarizeProjection(series);

    return jsonOk({
      id: account.id,
      name: account.name,
      currency: dominant.currency,
      summary: {
        totalContributions: summary.totalContributions.toString(),
        finalNominal: summary.finalNominal.toString(),
        finalReal: summary.finalReal.toString(),
        totalReturn: summary.totalReturn.toString()
      },
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
