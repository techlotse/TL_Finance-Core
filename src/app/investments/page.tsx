import { prisma } from "@/lib/prisma";
import { getActiveHouseholdForPage } from "@/lib/page-auth";
import { PageHeader } from "@/components/page-header";
import {
  InvestmentsClient,
  type ProjectionRow,
  type InvestmentAccountRow
} from "./investments-client";

export const dynamic = "force-dynamic";

export default async function InvestmentsPage() {
  const household = await getActiveHouseholdForPage("/investments");
  const [projections, accounts, investmentAccounts] = await Promise.all([
    prisma.investmentProjection.findMany({
      where: { householdId: household.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: { account: true }
    }),
    // Linkable accounts dropdown for synthetic projections.
    prisma.bankAccount.findMany({
      where: { householdId: household.id, active: true, deletedAt: null }
    }),
    // Investment-type accounts surfaced as their own cards.
    prisma.bankAccount.findMany({
      where: {
        householdId: household.id,
        accountType: "investment",
        deletedAt: null
      },
      include: { currencies: true },
      orderBy: { createdAt: "asc" }
    })
  ]);

  const rows: ProjectionRow[] = projections.map((p) => ({
    id: p.id,
    name: p.name,
    startingCapital: p.startingCapital.toString(),
    currency: p.currency,
    recurringContribution: p.recurringContribution.toString(),
    contributionFrequency: p.contributionFrequency,
    expectedAnnualReturn: p.expectedAnnualReturn.toString(),
    annualFeeDrag: p.annualFeeDrag.toString(),
    inflationRate: p.inflationRate.toString(),
    horizonYears: p.horizonYears,
    account: p.account ? { id: p.account.id, name: p.account.name } : null
  }));

  const investmentRows: InvestmentAccountRow[] = investmentAccounts.map((a) => ({
    id: a.id,
    name: a.name,
    institution: a.institution,
    expectedAnnualReturn: a.expectedAnnualReturn?.toString() ?? null,
    monthlyManagementCost: a.monthlyManagementCost?.toString() ?? null,
    currencies: a.currencies.map((c) => ({
      currency: c.currency,
      currentBalance: c.currentBalance.toString()
    }))
  }));

  return (
    <>
      <PageHeader
        title="Investments"
        description="Project nominal and inflation-adjusted growth."
      />
      <InvestmentsClient
        initialProjections={rows}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        investmentAccounts={investmentRows}
      />
    </>
  );
}
