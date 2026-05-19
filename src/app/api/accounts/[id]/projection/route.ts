import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { getActiveHouseholdId } from "@/lib/household";
import { OwnershipError } from "@/lib/ownership";
import { projectInvestment, summarizeProjection } from "@/lib/investment";
import { Decimal, toDecimal } from "@/lib/money";
import { getExchangeRate } from "@/lib/exchange-rates";
import { monthlyMultiplier } from "@/lib/recurrence";

/**
 * GET /api/accounts/[id]/projection?horizonYears=25
 *
 * Projects an investment or retirement bank account forward using its
 * `expectedAnnualReturn` and `monthlyManagementCost` fields. The starting
 * capital is the sum of the account's current pocket balances projected in
 * the account's first currency to keep the chart single-axis. Scheduled
 * transfers into the account are treated as recurring contributions.
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

    if (account.accountType !== "investment" && !account.retirement) {
      return jsonError(
        "Projection is only available for investment or retirement accounts",
        400
      );
    }
    const expectedAnnualReturn =
      account.expectedAnnualReturn ?? account.annualInterestRate;
    if (!expectedAnnualReturn) {
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
    const rateCache = new Map<string, Decimal>();
    async function rate(from: string, to: string): Promise<Decimal> {
      const source = from.toUpperCase();
      const target = to.toUpperCase();
      if (source === target) return toDecimal(1);
      const key = `${source}:${target}`;
      let cached = rateCache.get(key);
      if (!cached) {
        cached = (await getExchangeRate(source, target)).rate;
        rateCache.set(key, cached);
      }
      return cached;
    }
    const startingCapital = account.currencies.reduce(
      (acc, c) => acc.plus(toDecimal(c.currentBalance)),
      toDecimal(0)
    );
    const transfers = await prisma.scheduledTransfer.findMany({
      where: {
        householdId,
        targetAccountId: account.id,
        active: true,
        deletedAt: null
      },
      include: { sourceAccount: true }
    });
    let recurringContribution = toDecimal(0);
    for (const transfer of transfers) {
      if (transfer.sourceAccount.accountType === "investment") continue;
      if (transfer.sourceAccount.retirement) continue;
      const sourceAmount = toDecimal(transfer.amount);
      const targetAmount = sourceAmount.mul(
        await rate(transfer.sourceCurrency, transfer.targetCurrency)
      );
      const dominantAmount = targetAmount.mul(
        await rate(transfer.targetCurrency, dominant.currency)
      );
      recurringContribution = recurringContribution.plus(
        dominantAmount.mul(monthlyMultiplier(transfer.recurrence))
      );
    }

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
      recurringContribution,
      contributionFrequency: "monthly",
      expectedAnnualReturn,
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
        recurringContribution: recurringContribution.toString(),
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
