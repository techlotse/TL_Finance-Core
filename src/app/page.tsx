import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveHouseholdOrOnboardingForPage } from "@/lib/page-auth";
import { summarizeMonthlyBudget, forecastBalances } from "@/lib/forecast";
import { convertManyToBase, getExchangeRate } from "@/lib/exchange-rates";
import { Decimal, formatMoneyWithCurrency, toDecimal } from "@/lib/money";
import { monthlyMultiplier } from "@/lib/recurrence";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  IncomeVsExpenseChart,
  IncomeVsExpenseLegend,
  BalanceForecastChart,
  ExpenseDistributionChart,
  IncomeSplitChart
} from "@/components/charts/dashboard-charts";
import { Wallet } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const ctx = await getActiveHouseholdOrOnboardingForPage("/");
  if (ctx.status === "needs-onboarding") redirect("/onboarding");
  const household = ctx.household;
  const baseCurrency = household.baseCurrency;

  const [items, accounts, earners, groups, transfers, assets] = await Promise.all([
    prisma.budgetLineItem.findMany({
      where: { householdId: household.id, active: true, deletedAt: null },
      include: { category: { include: { group: true } }, account: true }
    }),
    prisma.bankAccount.findMany({
      where: { householdId: household.id, active: true, deletedAt: null },
      include: { currencies: true }
    }),
    prisma.incomeEarner.findMany({
      where: { householdId: household.id, active: true, deletedAt: null }
    }),
    prisma.categoryGroup.findMany({
      where: { householdId: household.id, deletedAt: null },
      include: { categories: { where: { deletedAt: null } } }
    }),
    prisma.scheduledTransfer.findMany({
      where: { householdId: household.id, active: true, deletedAt: null }
    }),
    prisma.asset.findMany({
      where: { householdId: household.id, active: true, deletedAt: null }
    })
  ]);

  const isEmpty = items.length === 0 && accounts.length === 0;
  if (isEmpty) {
    return (
      <>
        <PageHeader
          title="Dashboard"
          description={`Welcome${household.name ? ", " + household.name : ""}.`}
        />
        <EmptyState
          icon={<Wallet className="h-5 w-5" />}
          title="Let's set up your household"
          description="Add a bank account and a few budget line items, then watch this dashboard come alive."
          action={
            <div className="flex gap-2">
              <Link
                href="/accounts"
                className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
              >
                Add bank account
              </Link>
              <Link
                href="/budget"
                className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium hover:bg-accent"
              >
                Add budget item
              </Link>
            </div>
          }
        />
      </>
    );
  }

  const summary = await summarizeMonthlyBudget(baseCurrency, items, accounts);

  // Total balance across all accounts.
  const balanceItems = accounts.flatMap((a) =>
    a.currencies.map((p) => ({
      amount: p.currentBalance,
      currency: p.currency
    }))
  );
  const balanceRes = await convertManyToBase(balanceItems, baseCurrency);

  // Income split by earner.
  const incomeByEarner = new Map<string, Decimal>();
  for (const e of earners) incomeByEarner.set(e.id, new Decimal(0));
  let unassignedIncome = new Decimal(0);

  for (const item of items.filter((i) => i.itemType === "income")) {
    const monthly = toDecimal(item.amount).mul(
      monthlyMultiplier(item.recurrence)
    );
    const r = await getExchangeRate(item.currency, baseCurrency);
    const inBase = monthly.mul(r.rate);
    if (item.incomeEarnerId) {
      incomeByEarner.set(
        item.incomeEarnerId,
        (incomeByEarner.get(item.incomeEarnerId) ?? new Decimal(0)).plus(inBase)
      );
    } else {
      unassignedIncome = unassignedIncome.plus(inBase);
    }
  }

  const incomeSplit = earners.map((e) => ({
    name: e.name,
    amount: incomeByEarner.get(e.id)?.toString() ?? "0"
  }));
  if (unassignedIncome.gt(0)) {
    incomeSplit.push({ name: "Unassigned", amount: unassignedIncome.toString() });
  }

  // Expense distribution by category group.
  const expenseByGroup = new Map<string, Decimal>();
  for (const g of groups) expenseByGroup.set(g.id, new Decimal(0));
  for (const item of items) {
    if (item.itemType === "income") continue;
    const monthly = toDecimal(item.amount).mul(
      monthlyMultiplier(item.recurrence)
    );
    const r = await getExchangeRate(item.currency, baseCurrency);
    const inBase = monthly.mul(r.rate);
    expenseByGroup.set(
      item.category.groupId,
      (expenseByGroup.get(item.category.groupId) ?? new Decimal(0)).plus(inBase)
    );
  }
  const expenseDistribution = groups.map((g) => ({
    name: g.name,
    amount: expenseByGroup.get(g.id)?.toString() ?? "0"
  }));

  // Income vs Expenses comparison data.
  // Income: each individual income line item is its own stream (more detail
  // than the per-earner pie chart, which lives in its own card). Expenses:
  // grouped by category group (mirrors the existing expense distribution
  // pie). Both lists are sorted descending so the largest streams sit at the
  // bottom of each stacked bar — visually steadier.
  const incomeStreamsList: { name: string; amount: string }[] = [];
  for (const item of items.filter((i) => i.itemType === "income")) {
    const monthly = toDecimal(item.amount).mul(
      monthlyMultiplier(item.recurrence)
    );
    const r = await getExchangeRate(item.currency, baseCurrency);
    const inBase = monthly.mul(r.rate);
    if (inBase.gt(0)) {
      incomeStreamsList.push({ name: item.name, amount: inBase.toString() });
    }
  }
  incomeStreamsList.sort((a, b) => Number(b.amount) - Number(a.amount));

  const expenseStreamsList = Array.from(expenseByGroup.entries())
    .map(([groupId, total]) => ({
      name: groups.find((g) => g.id === groupId)?.name ?? "Unassigned",
      amount: total.toString()
    }))
    .filter((s) => Number(s.amount) > 0)
    .sort((a, b) => Number(b.amount) - Number(a.amount));

  // 1-year balance forecast preview.
  const forecastSeries = await forecastBalances({
    baseCurrency,
    accounts,
    budgetItems: items,
    transfers,
    horizonYears: 1
  });
  const forecastForChart = forecastSeries.map((p) => ({
    month: p.month,
    totalBaseCurrency: p.totalBaseCurrency.toString()
  }));
  const forecastEnd =
    forecastSeries[forecastSeries.length - 1]?.totalBaseCurrency.toString() ??
    "0";

  // Assets — current total in base currency + 12-month projection. We project
  // each asset month-by-month using its appreciationRate (signed), then sum
  // all assets per month. Two series: total today (flat) and projected.
  const assetItemsForFx = assets.map((a) => ({
    amount: a.value,
    currency: a.currency
  }));
  const assetTotals = await convertManyToBase(assetItemsForFx, baseCurrency);
  const assetTotalNow = assetTotals.total;

  // Per-asset 12-month forward series (in base) used to render a small
  // line chart. Compounding monthly: rate / 12 each step, signed.
  const assetForecast: { month: string; total: string }[] = [];
  for (let m = 0; m <= 12; m++) {
    let monthTotal = new Decimal(0);
    for (const a of assets) {
      const monthlyRate = toDecimal(a.annualAppreciationRate).div(12);
      const factor = new Decimal(1).plus(monthlyRate).pow(m);
      const valNative = toDecimal(a.value).mul(factor);
      const r = await getExchangeRate(a.currency, baseCurrency);
      monthTotal = monthTotal.plus(valNative.mul(r.rate));
    }
    const d = new Date();
    d.setMonth(d.getMonth() + m);
    assetForecast.push({
      month: d.toISOString().slice(0, 7),
      total: monthTotal.toString()
    });
  }

  const stale = new Set([
    ...summary.staleCurrencies,
    ...Array.from(balanceRes.staleCurrencies)
  ]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Monthly view in ${baseCurrency}.`}
        actions={
          stale.size > 0 ? (
            <Badge variant="warning">
              Using cached rates for {Array.from(stale).join(", ")}
            </Badge>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryCard
          label="Monthly income"
          value={formatMoneyWithCurrency(summary.monthlyIncome, baseCurrency)}
          accent="text-success"
        />
        <SummaryCard
          label="Monthly expenses"
          value={formatMoneyWithCurrency(summary.monthlyExpenses, baseCurrency)}
          accent="text-destructive"
        />
        <SummaryCard
          label="Monthly net"
          value={formatMoneyWithCurrency(summary.net, baseCurrency)}
          accent={summary.net.gte(0) ? "text-success" : "text-destructive"}
        />
        <SummaryCard
          label="Total balance"
          value={formatMoneyWithCurrency(balanceRes.total, baseCurrency)}
        />
        <SummaryCard
          label="Forecast in 1 year"
          value={formatMoneyWithCurrency(forecastEnd, baseCurrency)}
          accent={
            Number(forecastEnd) >= Number(balanceRes.total.toString())
              ? "text-success"
              : "text-destructive"
          }
        />
        <SummaryCard
          label="Total assets"
          value={formatMoneyWithCurrency(assetTotalNow, baseCurrency)}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Income split by earner</CardTitle>
            <CardDescription>Monthly inflows in {baseCurrency}.</CardDescription>
          </CardHeader>
          <CardContent>
            <IncomeSplitChart data={incomeSplit} currency={baseCurrency} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Expense distribution</CardTitle>
            <CardDescription>By category group, monthly.</CardDescription>
          </CardHeader>
          <CardContent>
            <ExpenseDistributionChart
              data={expenseDistribution}
              currency={baseCurrency}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Income vs Expenses</CardTitle>
            <CardDescription>
              Total monthly income vs expenses, stacked by stream.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <IncomeVsExpenseChart
              incomeStreams={incomeStreamsList}
              expenseStreams={expenseStreamsList}
              currency={baseCurrency}
            />
            <IncomeVsExpenseLegend
              incomeStreams={incomeStreamsList}
              expenseStreams={expenseStreamsList}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>1-year balance forecast</CardTitle>
            <CardDescription>
              Total household balance, all accounts in {baseCurrency}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BalanceForecastChart
              data={forecastForChart}
              currency={baseCurrency}
            />
          </CardContent>
        </Card>

        {assets.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Assets value (12 months)</CardTitle>
              <CardDescription>
                Projected appreciation / depreciation of tracked assets in{" "}
                {baseCurrency}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BalanceForecastChart
                data={assetForecast.map((p) => ({
                  month: p.month,
                  totalBaseCurrency: p.total
                }))}
                currency={baseCurrency}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

function SummaryCard({
  label,
  value,
  accent
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className={`mt-2 text-xl font-semibold tabular ${accent ?? ""}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
