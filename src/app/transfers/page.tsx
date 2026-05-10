import { prisma } from "@/lib/prisma";
import { getActiveHouseholdForPage } from "@/lib/page-auth";
import { PageHeader } from "@/components/page-header";
import { TransfersClient, type TransferRow } from "./transfers-client";

export const dynamic = "force-dynamic";

export default async function TransfersPage() {
  const household = await getActiveHouseholdForPage("/transfers");
  const [transfers, accounts] = await Promise.all([
    prisma.scheduledTransfer.findMany({
      where: { householdId: household.id, deletedAt: null },
      orderBy: { startDate: "asc" },
      include: { sourceAccount: true, targetAccount: true }
    }),
    prisma.bankAccount.findMany({
      where: { householdId: household.id, active: true, deletedAt: null },
      include: { currencies: true }
    })
  ]);

  const rows: TransferRow[] = transfers.map((t) => ({
    id: t.id,
    name: t.name,
    amount: t.amount.toString(),
    sourceCurrency: t.sourceCurrency,
    targetCurrency: t.targetCurrency,
    recurrence: t.recurrence,
    startDate: t.startDate.toISOString(),
    endDate: t.endDate?.toISOString() ?? null,
    active: t.active,
    notes: t.notes,
    sourceAccount: { id: t.sourceAccount.id, name: t.sourceAccount.name },
    targetAccount: { id: t.targetAccount.id, name: t.targetAccount.name }
  }));

  return (
    <>
      <PageHeader
        title="Scheduled Transfers"
        description="Move money between accounts on a schedule. Multi-currency supported."
      />
      <TransfersClient
        initialTransfers={rows}
        accounts={accounts.map((a) => ({
          id: a.id,
          name: a.name,
          currencies: a.currencies.map((c) => ({ currency: c.currency }))
        }))}
      />
    </>
  );
}
