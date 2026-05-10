import { prisma } from "@/lib/prisma";
import { getActiveHouseholdForPage } from "@/lib/page-auth";
import { PageHeader } from "@/components/page-header";
import { BudgetClient, type BudgetItemRow } from "./budget-client";

export const dynamic = "force-dynamic";

export default async function BudgetPage() {
  const household = await getActiveHouseholdForPage("/budget");
  const [items, groups, accounts, earners] = await Promise.all([
    prisma.budgetLineItem.findMany({
      where: { householdId: household.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        category: { include: { group: true } },
        account: true,
        incomeEarner: true
      }
    }),
    prisma.categoryGroup.findMany({
      where: { householdId: household.id, deletedAt: null },
      orderBy: { sortOrder: "asc" },
      include: {
        categories: {
          where: { deletedAt: null },
          orderBy: { sortOrder: "asc" }
        }
      }
    }),
    prisma.bankAccount.findMany({
      where: { householdId: household.id, deletedAt: null },
      include: { currencies: true }
    }),
    prisma.incomeEarner.findMany({
      where: { householdId: household.id, deletedAt: null }
    })
  ]);

  const rows: BudgetItemRow[] = items.map((it) => ({
    id: it.id,
    name: it.name,
    itemType: it.itemType,
    amount: it.amount.toString(),
    currency: it.currency,
    recurrence: it.recurrence,
    startDate: it.startDate.toISOString(),
    endDate: it.endDate?.toISOString() ?? null,
    debitDayOfMonth: it.debitDayOfMonth,
    expectedAnnualReturn: it.expectedAnnualReturn?.toString() ?? null,
    monthlyManagementCost: it.monthlyManagementCost?.toString() ?? null,
    active: it.active,
    notes: it.notes,
    category: {
      id: it.category.id,
      name: it.category.name,
      group: { id: it.category.group.id, name: it.category.group.name }
    },
    account: it.account ? { id: it.account.id, name: it.account.name } : null,
    incomeEarner: it.incomeEarner
      ? { id: it.incomeEarner.id, name: it.incomeEarner.name }
      : null
  }));

  return (
    <>
      <PageHeader
        title="Budget"
        description={`Income, expenses and contributions in ${household.baseCurrency}.`}
      />
      <BudgetClient
        initialItems={rows}
        groups={groups.map((g) => ({
          id: g.id,
          name: g.name,
          categories: g.categories.map((c) => ({
            id: c.id,
            name: c.name,
            type: c.type
          }))
        }))}
        accounts={accounts.map((a) => ({
          id: a.id,
          name: a.name,
          currencies: a.currencies.map((c) => ({ currency: c.currency }))
        }))}
        earners={earners.map((e) => ({ id: e.id, name: e.name }))}
        baseCurrency={household.baseCurrency}
      />
    </>
  );
}
