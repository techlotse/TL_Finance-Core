import { prisma } from "@/lib/prisma";
import { getActiveHouseholdForPage } from "@/lib/page-auth";
import { PageHeader } from "@/components/page-header";
import { AccountsClient, type AccountRow } from "./accounts-client";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const household = await getActiveHouseholdForPage("/accounts");
  const accounts = await prisma.bankAccount.findMany({
    where: { householdId: household.id, deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: { currencies: true }
  });

  const rows: AccountRow[] = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    institution: a.institution,
    accountType: a.accountType,
    active: a.active,
    notes: a.notes,
    monthlyCost: a.monthlyCost?.toString() ?? null,
    monthlyCostCurrency: a.monthlyCostCurrency ?? null,
    annualInterestRate: a.annualInterestRate?.toString() ?? null,
    expectedAnnualReturn: a.expectedAnnualReturn?.toString() ?? null,
    monthlyManagementCost: a.monthlyManagementCost?.toString() ?? null,
    minimumMonthlyPayment: a.minimumMonthlyPayment?.toString() ?? null,
    // Include the pocket id so the snapshot dialog can post against it.
    currencies: a.currencies.map((c) => ({
      id: c.id,
      currency: c.currency,
      openingBalance: c.openingBalance.toString(),
      currentBalance: c.currentBalance.toString()
    }))
  }));

  return (
    <>
      <PageHeader
        title="Bank Accounts"
        description="Manage accounts and their currency pockets."
      />
      <AccountsClient initialAccounts={rows} />
    </>
  );
}
