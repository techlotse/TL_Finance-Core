import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { getActiveHouseholdId } from "@/lib/household";
import { OwnershipError } from "@/lib/ownership";
import { projectDebtPayoff } from "@/lib/debt";
import { toDecimal } from "@/lib/money";

/**
 * GET /api/accounts/[id]/debt-projection
 *
 * Projects payoff for a credit-type bank account. Pulls the configured
 * `annualInterestRate` and `minimumMonthlyPayment` from the account, sums
 * the outstanding balance across pockets (treated as positive number), and
 * returns the month-by-month series so the chart can render. Optional
 * `?monthlyPayment=` query param overrides the configured minimum so the
 * user can see "what if I paid X" scenarios.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const householdId = await getActiveHouseholdId();
    const { id: accountId } = await params;
    const url = new URL(req.url);

    const account = await prisma.bankAccount.findFirst({
      where: { id: accountId, householdId, deletedAt: null },
      include: { currencies: true }
    });
    if (!account) throw new OwnershipError("Account not found", 404);

    if (account.accountType !== "credit") {
      return jsonError(
        "Debt projection is only available for credit-type accounts",
        400
      );
    }
    if (!account.annualInterestRate) {
      return jsonError("This account has no annual interest rate set", 400);
    }

    const overridePayment = url.searchParams.get("monthlyPayment");
    const monthlyPayment = overridePayment
      ? overridePayment
      : account.minimumMonthlyPayment?.toString();
    if (!monthlyPayment) {
      return jsonError(
        "This account has no minimum monthly payment set; provide ?monthlyPayment= to project",
        400
      );
    }

    // Treat balance as positive — credit accounts often store the
    // outstanding amount as a positive number ("you owe X"). If a user
    // chose to track it as negative we flip the sign so the math works.
    const summed = account.currencies.reduce(
      (acc, c) => acc.plus(toDecimal(c.currentBalance)),
      toDecimal(0)
    );
    const balance = summed.lt(0) ? summed.abs() : summed;
    const dominantCurrency = account.currencies[0]?.currency ?? "CHF";

    const result = projectDebtPayoff({
      balance,
      annualInterestRate: account.annualInterestRate,
      monthlyPayment
    });

    // Sample down — the series can be 100s of months. Yearly markers plus
    // last point keep the chart smooth.
    const sampled = result.series.filter(
      (p, i) =>
        p.month % 12 === 0 || i === 0 || i === result.series.length - 1
    );

    return jsonOk({
      accountId: account.id,
      currency: dominantCurrency,
      balance: balance.toString(),
      monthlyPayment,
      annualInterestRate: account.annualInterestRate.toString(),
      payoffPossible: result.payoffPossible,
      monthsToPayoff: result.monthsToPayoff,
      totalInterestPaid: result.totalInterestPaid.toString(),
      totalPaid: result.totalPaid.toString(),
      points: sampled.map((p) => ({
        month: p.month,
        balance: p.balance.toString(),
        cumulativeInterest: p.cumulativeInterest.toString(),
        monthlyInterest: p.monthlyInterest.toString(),
        monthlyPrincipal: p.monthlyPrincipal.toString()
      }))
    });
  } catch (err) {
    return handleApiError(err);
  }
}
