import { prisma } from "@/lib/prisma";
import { getActiveHousehold } from "@/lib/household";
import { handleApiError, jsonOk } from "@/lib/api";
import { summarizeMonthlyBudget } from "@/lib/forecast";
import { Decimal, toDecimal } from "@/lib/money";
import { monthlyMultiplier } from "@/lib/recurrence";
import { convertManyToBase, getExchangeRate } from "@/lib/exchange-rates";

export async function GET() {
  try {
    const household = await getActiveHousehold();
    const [items, accounts, earners, groups] = await Promise.all([
      prisma.budgetLineItem.findMany({
        where: { householdId: household.id, active: true, deletedAt: null },
        include: { category: { include: { group: true } }, account: true }
      }),
      prisma.bankAccount.findMany({
        where: { householdId: household.id, active: true, deletedAt: null },
        include: { currencies: true }
      }),
      prisma.incomeEarner.findMany({
        where: { householdId: household.id, active: true }
      }),
      prisma.categoryGroup.findMany({
        where: { householdId: household.id, deletedAt: null },
        include: { categories: { where: { deletedAt: null } } }
      })
    ]);

    const summary = await summarizeMonthlyBudget(
      household.baseCurrency,
      items,
      accounts
    );

    // Total balance across all accounts in base currency.
    const balanceItems = accounts.flatMap((a) =>
      a.currencies.map((p) => ({
        amount: p.currentBalance,
        currency: p.currency
      }))
    );
    const balanceRes = await convertManyToBase(
      balanceItems,
      household.baseCurrency
    );

    // Income split by earner.
    const incomeByEarner: Record<string, Decimal> = {};
    for (const e of earners) incomeByEarner[e.id] = new Decimal(0);
    incomeByEarner["_unassigned"] = new Decimal(0);

    for (const item of items.filter((i) => i.itemType === "income")) {
      const monthly = toDecimal(item.amount).mul(
        monthlyMultiplier(item.recurrence)
      );
      const r = await getExchangeRate(item.currency, household.baseCurrency);
      const inBase = monthly.mul(r.rate);
      const key = item.incomeEarnerId ?? "_unassigned";
      incomeByEarner[key] = (incomeByEarner[key] ?? new Decimal(0)).plus(inBase);
    }

    const incomeSplit = earners.map((e) => ({
      earnerId: e.id,
      name: e.name,
      amount: incomeByEarner[e.id].toString()
    }));
    if (incomeByEarner["_unassigned"].gt(0)) {
      incomeSplit.push({
        earnerId: "_unassigned",
        name: "Unassigned",
        amount: incomeByEarner["_unassigned"].toString()
      });
    }

    // Expense distribution by category group (excluding income).
    const expenseByGroup: Record<string, Decimal> = {};
    for (const g of groups) expenseByGroup[g.id] = new Decimal(0);
    for (const item of items) {
      if (item.itemType === "income") continue;
      const monthly = toDecimal(item.amount).mul(
        monthlyMultiplier(item.recurrence)
      );
      const r = await getExchangeRate(item.currency, household.baseCurrency);
      const inBase = monthly.mul(r.rate);
      const groupId = item.category.groupId;
      expenseByGroup[groupId] = (expenseByGroup[groupId] ?? new Decimal(0)).plus(
        inBase
      );
    }
    const expenseDistribution = groups
      .map((g) => ({
        groupId: g.id,
        name: g.name,
        amount: expenseByGroup[g.id]?.toString() ?? "0"
      }))
      .filter((g) => Number(g.amount) > 0);

    // Account income vs expenses.
    const accountFlows: Record<
      string,
      { name: string; income: Decimal; expense: Decimal }
    > = {};
    for (const a of accounts) {
      accountFlows[a.id] = {
        name: a.name,
        income: new Decimal(0),
        expense: new Decimal(0)
      };
    }
    for (const item of items) {
      const accId = item.accountId ?? "_unassigned";
      if (!accountFlows[accId]) {
        accountFlows[accId] = {
          name: accId === "_unassigned" ? "Unassigned" : accId,
          income: new Decimal(0),
          expense: new Decimal(0)
        };
      }
      const monthly = toDecimal(item.amount).mul(
        monthlyMultiplier(item.recurrence)
      );
      const r = await getExchangeRate(item.currency, household.baseCurrency);
      const inBase = monthly.mul(r.rate);
      if (item.itemType === "income") {
        accountFlows[accId].income = accountFlows[accId].income.plus(inBase);
      } else {
        accountFlows[accId].expense = accountFlows[accId].expense.plus(inBase);
      }
    }
    const accountIncomeVsExpense = Object.entries(accountFlows).map(
      ([id, v]) => ({
        accountId: id,
        name: v.name,
        income: v.income.toString(),
        expense: v.expense.toString(),
        net: v.income.minus(v.expense).toString()
      })
    );

    return jsonOk({
      baseCurrency: household.baseCurrency,
      monthlyIncome: summary.monthlyIncome.toString(),
      monthlyExpenses: summary.monthlyExpenses.toString(),
      monthlyInvestmentContributions:
        summary.monthlyInvestmentContributions.toString(),
      monthlyBankCharges: summary.monthlyBankCharges.toString(),
      net: summary.net.toString(),
      totalBalance: balanceRes.total.toString(),
      staleCurrencies: [
        ...new Set([
          ...summary.staleCurrencies,
          ...Array.from(balanceRes.staleCurrencies)
        ])
      ],
      incomeSplit,
      expenseDistribution,
      accountIncomeVsExpense
    });
  } catch (err) {
    return handleApiError(err);
  }
}
