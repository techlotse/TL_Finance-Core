import { prisma } from "@/lib/prisma";
import { getActiveHouseholdForPage } from "@/lib/page-auth";
import { PageHeader } from "@/components/page-header";
import { DebtClient, type DebtAccountRow } from "./debt-client";

export const dynamic = "force-dynamic";

export default async function DebtPage() {
  const household = await getActiveHouseholdForPage("/debt");
  const accounts = await prisma.bankAccount.findMany({
    where: {
      householdId: household.id,
      accountType: "credit",
      deletedAt: null
    },
    include: { currencies: true },
    orderBy: { createdAt: "asc" }
  });

  const rows: DebtAccountRow[] = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    institution: a.institution,
    active: a.active,
    annualInterestRate: a.annualInterestRate?.toString() ?? null,
    minimumMonthlyPayment: a.minimumMonthlyPayment?.toString() ?? null,
    currencies: a.currencies.map((c) => ({
      currency: c.currency,
      currentBalance: c.currentBalance.toString()
    }))
  }));

  return (
    <>
      <PageHeader
        title="Debt"
        description="Credit accounts, payoff projections and total interest if you stick to the minimum."
      />
      <DebtClient accounts={rows} baseCurrency={household.baseCurrency} />
    </>
  );
}
