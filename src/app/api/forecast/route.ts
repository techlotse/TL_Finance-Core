import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveHousehold } from "@/lib/household";
import { handleApiError, jsonOk } from "@/lib/api";
import { ALLOWED_HORIZONS, forecastBalances, type Horizon } from "@/lib/forecast";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const horizonRaw = Number(url.searchParams.get("horizonYears") ?? "5");
    const horizon = (
      ALLOWED_HORIZONS.includes(horizonRaw as Horizon) ? horizonRaw : 5
    ) as Horizon;

    const household = await getActiveHousehold();
    const [accounts, items, transfers] = await Promise.all([
      prisma.bankAccount.findMany({
        where: { householdId: household.id, active: true, deletedAt: null },
        include: { currencies: true }
      }),
      prisma.budgetLineItem.findMany({
        where: { householdId: household.id, active: true, deletedAt: null }
      }),
      prisma.scheduledTransfer.findMany({
        where: { householdId: household.id, active: true, deletedAt: null }
      })
    ]);

    const series = await forecastBalances({
      baseCurrency: household.baseCurrency,
      accounts,
      budgetItems: items,
      transfers,
      horizonYears: horizon
    });

    // Stringify Decimals for transport.
    const points = series.map((p) => ({
      month: p.month,
      date: p.date.toISOString(),
      totalBaseCurrency: p.totalBaseCurrency.toString(),
      netWorthBaseCurrency: p.netWorthBaseCurrency.toString(),
      monthlyIncome: p.monthlyIncome.toString(),
      monthlyExpenses: p.monthlyExpenses.toString(),
      netCashflow: p.netCashflow.toString(),
      accountBalances: Object.fromEntries(
        Object.entries(p.accountBalances).map(([k, v]) => [k, v.toString()])
      ),
      investmentBalances: Object.fromEntries(
        Object.entries(p.investmentBalances).map(([k, v]) => [k, v.toString()])
      )
    }));

    // Yearly summary table.
    const yearly = points.filter((_, idx) => idx > 0 && (idx + 1) % 12 === 0);

    return jsonOk({
      horizonYears: horizon,
      baseCurrency: household.baseCurrency,
      accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
      points,
      yearly
    });
  } catch (err) {
    return handleApiError(err);
  }
}
