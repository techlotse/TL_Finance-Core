import { prisma } from "@/lib/prisma";
import { getActiveHouseholdForPage } from "@/lib/page-auth";
import { ALLOWED_HORIZONS, forecastBalances, type Horizon } from "@/lib/forecast";
import { PageHeader } from "@/components/page-header";
import { PlanningPreviewBanner } from "@/components/planning-preview-banner";
import { Badge } from "@/components/ui/badge";
import { ForecastClient, type ForecastPayload } from "./forecast-client";

export const dynamic = "force-dynamic";

export default async function ForecastPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const requested = Number(params.horizonYears ?? "5");
  const horizon = (
    ALLOWED_HORIZONS.includes(requested as Horizon) ? requested : 5
  ) as Horizon;

  const household = await getActiveHouseholdForPage("/forecast");
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

  const points = series.map((p) => ({
    month: p.month,
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
  const yearly = points.filter((_, idx) => idx > 0 && (idx + 1) % 12 === 0);

  const investmentItems = items
    .filter((i) => i.itemType === "investment_contribution")
    .map((i) => ({ id: i.id, name: i.name, currency: i.currency }));

  const payload: ForecastPayload = {
    horizonYears: horizon,
    baseCurrency: household.baseCurrency,
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      accountType: a.accountType
    })),
    investmentItems,
    points,
    yearly
  };

  return (
    <>
      <PageHeader
        title="Forecast"
        description={`Balance trajectory in ${household.baseCurrency}.`}
        actions={<Badge variant="outline">{horizon}-year horizon</Badge>}
      />
      <PlanningPreviewBanner tool="Forecast" />
      <ForecastClient horizon={horizon} initial={payload} />
    </>
  );
}
