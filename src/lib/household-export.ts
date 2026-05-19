import { prisma } from "./prisma";

/**
 * Household export / import — pure JSON, no FK ids.
 *
 * The shape is deliberately *id-free*: every reference is by name (category
 * group name, category name, account name, earner name). That keeps exports
 * portable across instances — you can drop a JSON dump from production into
 * a fresh local container and re-import without ID collisions.
 *
 * Versioning: bump `version` whenever the on-the-wire shape changes in a
 * non-additive way. Imports check the version and refuse anything they don't
 * understand rather than silently dropping fields.
 */

// Bumped to 2: adds bank-account investment / debt fields and the Asset
// model. v1 exports remain importable — see the import path below for the
// backwards-compatibility branch.
export const HOUSEHOLD_EXPORT_VERSION = 2;

export interface HouseholdExport {
  version: number;
  exportedAt: string;
  household: {
    name: string;
    baseCurrency: string;
  };
  incomeEarners: Array<{
    name: string;
    notes: string | null;
    active: boolean;
  }>;
  categoryGroups: Array<{
    name: string;
    sortOrder: number;
    categories: Array<{
      name: string;
      type: "income" | "expense" | "transfer" | "investment";
      sortOrder: number;
      active: boolean;
    }>;
  }>;
  bankAccounts: Array<{
    name: string;
    institution: string | null;
    accountType: "current" | "savings" | "investment" | "credit" | "cash" | "other";
    notes: string | null;
    active: boolean;
    monthlyCost: string | null;
    monthlyCostCurrency: string | null;
    annualInterestRate: string | null;
    expectedAnnualReturn: string | null;
    monthlyManagementCost: string | null;
    retirement?: boolean;
    kidsSavings?: boolean;
    minimumMonthlyPayment: string | null;
    currencies: Array<{
      currency: string;
      openingBalance: string;
      currentBalance: string;
    }>;
  }>;
  assets: Array<{
    name: string;
    category:
      | "property"
      | "vehicle"
      | "jewelry"
      | "collectible"
      | "precious_metal"
      | "electronics"
      | "other";
    value: string;
    currency: string;
    annualAppreciationRate: string;
    acquiredAt: string | null;
    notes: string | null;
    active: boolean;
  }>;
  budgetItems: Array<{
    name: string;
    itemType: "income" | "expense" | "investment_contribution";
    amount: string;
    currency: string;
    recurrence: "once" | "weekly" | "monthly" | "quarterly" | "yearly";
    startDate: string;
    endDate: string | null;
    debitDayOfMonth: number | null;
    expectedAnnualReturn: string | null;
    monthlyManagementCost: string | null;
    notes: string | null;
    active: boolean;
    // Reference fields use names, not IDs.
    categoryGroupName: string;
    categoryName: string;
    accountName: string | null;
    incomeEarnerName: string | null;
  }>;
  scheduledTransfers: Array<{
    name: string;
    sourceAccountName: string;
    sourceCurrency: string;
    targetAccountName: string;
    targetCurrency: string;
    amount: string;
    recurrence: "once" | "weekly" | "monthly" | "quarterly" | "yearly";
    startDate: string;
    endDate: string | null;
    notes: string | null;
    active: boolean;
  }>;
  investmentProjections: Array<{
    name: string;
    startingCapital: string;
    currency: string;
    recurringContribution: string;
    contributionFrequency: "monthly" | "quarterly" | "yearly";
    expectedAnnualReturn: string;
    annualFeeDrag: string;
    inflationRate: string;
    horizonYears: number;
    accountName: string | null;
  }>;
}

/**
 * Build the export payload for a household. Soft-deleted entities are
 * excluded — exports represent the current live state, not history.
 */
export async function exportHousehold(householdId: string): Promise<HouseholdExport> {
  const [
    household,
    earners,
    groups,
    accounts,
    budgetItems,
    transfers,
    projections,
    assets
  ] = await Promise.all([
    prisma.household.findUniqueOrThrow({ where: { id: householdId } }),
    prisma.incomeEarner.findMany({
      where: { householdId, deletedAt: null },
      orderBy: { createdAt: "asc" }
    }),
    prisma.categoryGroup.findMany({
      where: { householdId, deletedAt: null },
      orderBy: { sortOrder: "asc" },
      include: {
        categories: {
          where: { deletedAt: null },
          orderBy: { sortOrder: "asc" }
        }
      }
    }),
    prisma.bankAccount.findMany({
      where: { householdId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      include: { currencies: true }
    }),
    prisma.budgetLineItem.findMany({
      where: { householdId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      include: {
        category: { include: { group: true } },
        account: true,
        incomeEarner: true
      }
    }),
    prisma.scheduledTransfer.findMany({
      where: { householdId, deletedAt: null },
      orderBy: { startDate: "asc" },
      include: { sourceAccount: true, targetAccount: true }
    }),
    prisma.investmentProjection.findMany({
      where: { householdId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      include: { account: true }
    }),
    prisma.asset.findMany({
      where: { householdId, deletedAt: null },
      orderBy: { createdAt: "asc" }
    })
  ]);

  return {
    version: HOUSEHOLD_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    household: {
      name: household.name,
      baseCurrency: household.baseCurrency
    },
    incomeEarners: earners.map((e) => ({
      name: e.name,
      notes: e.notes,
      active: e.active
    })),
    categoryGroups: groups.map((g) => ({
      name: g.name,
      sortOrder: g.sortOrder,
      categories: g.categories.map((c) => ({
        name: c.name,
        type: c.type,
        sortOrder: c.sortOrder,
        active: c.active
      }))
    })),
    bankAccounts: accounts.map((a) => ({
      name: a.name,
      institution: a.institution,
      accountType: a.accountType,
      notes: a.notes,
      active: a.active,
      monthlyCost: a.monthlyCost?.toString() ?? null,
      monthlyCostCurrency: a.monthlyCostCurrency,
      annualInterestRate: a.annualInterestRate?.toString() ?? null,
      expectedAnnualReturn: a.expectedAnnualReturn?.toString() ?? null,
      monthlyManagementCost: a.monthlyManagementCost?.toString() ?? null,
      retirement: a.retirement,
      kidsSavings: a.kidsSavings,
      minimumMonthlyPayment: a.minimumMonthlyPayment?.toString() ?? null,
      currencies: a.currencies.map((c) => ({
        currency: c.currency,
        openingBalance: c.openingBalance.toString(),
        currentBalance: c.currentBalance.toString()
      }))
    })),
    assets: assets.map((a) => ({
      name: a.name,
      category: a.category,
      value: a.value.toString(),
      currency: a.currency,
      annualAppreciationRate: a.annualAppreciationRate.toString(),
      acquiredAt: a.acquiredAt?.toISOString() ?? null,
      notes: a.notes,
      active: a.active
    })),
    budgetItems: budgetItems.map((b) => ({
      name: b.name,
      itemType: b.itemType,
      amount: b.amount.toString(),
      currency: b.currency,
      recurrence: b.recurrence,
      startDate: b.startDate.toISOString(),
      endDate: b.endDate?.toISOString() ?? null,
      debitDayOfMonth: b.debitDayOfMonth,
      expectedAnnualReturn: b.expectedAnnualReturn?.toString() ?? null,
      monthlyManagementCost: b.monthlyManagementCost?.toString() ?? null,
      notes: b.notes,
      active: b.active,
      categoryGroupName: b.category.group.name,
      categoryName: b.category.name,
      accountName: b.account?.name ?? null,
      incomeEarnerName: b.incomeEarner?.name ?? null
    })),
    scheduledTransfers: transfers.map((t) => ({
      name: t.name,
      sourceAccountName: t.sourceAccount.name,
      sourceCurrency: t.sourceCurrency,
      targetAccountName: t.targetAccount.name,
      targetCurrency: t.targetCurrency,
      amount: t.amount.toString(),
      recurrence: t.recurrence,
      startDate: t.startDate.toISOString(),
      endDate: t.endDate?.toISOString() ?? null,
      notes: t.notes,
      active: t.active
    })),
    investmentProjections: projections.map((p) => ({
      name: p.name,
      startingCapital: p.startingCapital.toString(),
      currency: p.currency,
      recurringContribution: p.recurringContribution.toString(),
      contributionFrequency: p.contributionFrequency,
      expectedAnnualReturn: p.expectedAnnualReturn.toString(),
      annualFeeDrag: p.annualFeeDrag.toString(),
      inflationRate: p.inflationRate.toString(),
      horizonYears: p.horizonYears,
      accountName: p.account?.name ?? null
    }))
  };
}

/**
 * Import strategy
 * ---------------
 * Imports replay a previously-exported JSON onto the *current* household.
 * They are additive: nothing in the household is deleted, and we use
 * (group, name) / (account, name) tuples as soft-uniqueness keys to avoid
 * duplicating rows on a re-import. This makes a re-import idempotent for
 * the structural taxonomy (groups, categories, earners, accounts) while
 * still appending new transactional rows (budget items, transfers,
 * projections).
 *
 * Pass `mode: "merge"` (default) to additively merge.
 * Pass `mode: "replace"` to wipe live entities first — destructive, used
 * when restoring into an empty household.
 */
export interface ImportResult {
  earners: { created: number; matched: number };
  groups: { created: number; matched: number };
  categories: { created: number; matched: number };
  accounts: { created: number; matched: number };
  budgetItems: { created: number; skipped: number };
  transfers: { created: number; skipped: number };
  projections: { created: number; skipped: number };
  assets: { created: number; skipped: number };
  warnings: string[];
}

export async function importHousehold(
  householdId: string,
  payload: HouseholdExport,
  mode: "merge" | "replace" = "merge"
): Promise<ImportResult> {
  // Forward-compat: accept earlier versions by upcasting missing fields.
  // v1 didn't have account-projection / debt fields nor the assets section.
  if (payload.version > HOUSEHOLD_EXPORT_VERSION) {
    throw new Error(
      `Export version ${payload.version} is newer than this instance supports (v${HOUSEHOLD_EXPORT_VERSION}). Upgrade the app first.`
    );
  }

  const result: ImportResult = {
    earners: { created: 0, matched: 0 },
    groups: { created: 0, matched: 0 },
    categories: { created: 0, matched: 0 },
    accounts: { created: 0, matched: 0 },
    budgetItems: { created: 0, skipped: 0 },
    transfers: { created: 0, skipped: 0 },
    projections: { created: 0, skipped: 0 },
    assets: { created: 0, skipped: 0 },
    warnings: []
  };

  await prisma.$transaction(
    async (tx) => {
      if (mode === "replace") {
        // Hard-delete in dependency order. Soft-deleted rows are removed too —
        // a "replace" really does mean "blank slate".
        await tx.scheduledTransfer.deleteMany({ where: { householdId } });
        await tx.budgetLineItem.deleteMany({ where: { householdId } });
        await tx.investmentProjection.deleteMany({ where: { householdId } });
        await tx.asset.deleteMany({ where: { householdId } });
        await tx.bankAccountCurrency.deleteMany({
          where: { account: { householdId } }
        });
        await tx.bankAccount.deleteMany({ where: { householdId } });
        await tx.category.deleteMany({ where: { householdId } });
        await tx.categoryGroup.deleteMany({ where: { householdId } });
        await tx.incomeEarner.deleteMany({ where: { householdId } });
      }

      // ---- Income earners ----
      const earnerByName = new Map<string, string>();
      for (const e of payload.incomeEarners) {
        const existing = await tx.incomeEarner.findFirst({
          where: { householdId, name: e.name, deletedAt: null }
        });
        if (existing) {
          earnerByName.set(e.name, existing.id);
          result.earners.matched++;
        } else {
          const created = await tx.incomeEarner.create({
            data: {
              householdId,
              name: e.name,
              notes: e.notes,
              active: e.active
            }
          });
          earnerByName.set(e.name, created.id);
          result.earners.created++;
        }
      }

      // ---- Category groups + categories ----
      const groupByName = new Map<string, string>();
      const categoryKey = (groupName: string, name: string) =>
        `${groupName}::${name}`;
      const categoryByKey = new Map<string, string>();

      for (const g of payload.categoryGroups) {
        const existing = await tx.categoryGroup.findFirst({
          where: { householdId, name: g.name, deletedAt: null }
        });
        const groupId = existing
          ? (result.groups.matched++, existing.id)
          : (
              await tx.categoryGroup.create({
                data: {
                  householdId,
                  name: g.name,
                  sortOrder: g.sortOrder
                }
              })
            ).id;
        if (!existing) result.groups.created++;
        groupByName.set(g.name, groupId);

        for (const c of g.categories) {
          const existingCat = await tx.category.findFirst({
            where: {
              householdId,
              groupId,
              name: c.name,
              deletedAt: null
            }
          });
          if (existingCat) {
            categoryByKey.set(categoryKey(g.name, c.name), existingCat.id);
            result.categories.matched++;
          } else {
            const createdCat = await tx.category.create({
              data: {
                householdId,
                groupId,
                name: c.name,
                type: c.type,
                sortOrder: c.sortOrder,
                active: c.active
              }
            });
            categoryByKey.set(categoryKey(g.name, c.name), createdCat.id);
            result.categories.created++;
          }
        }
      }

      // ---- Bank accounts (with currency pockets) ----
      const accountByName = new Map<string, string>();
      for (const a of payload.bankAccounts) {
        const existing = await tx.bankAccount.findFirst({
          where: { householdId, name: a.name, deletedAt: null }
        });
        if (existing) {
          accountByName.set(a.name, existing.id);
          result.accounts.matched++;
          // Don't overwrite currency balances on a merge — would surprise the user.
          continue;
        }
        const kidsSavings =
          a.accountType === "savings" && a.kidsSavings === true;
        const retirement = kidsSavings ? false : a.retirement === true;
        const created = await tx.bankAccount.create({
          data: {
            householdId,
            name: a.name,
            institution: a.institution,
            accountType: a.accountType,
            notes: a.notes,
            active: a.active,
            retirement,
            kidsSavings,
            monthlyCost: a.monthlyCost ?? null,
            monthlyCostCurrency: a.monthlyCostCurrency,
            annualInterestRate: a.annualInterestRate ?? null,
            // v2 fields — default to null on v1 imports.
            expectedAnnualReturn: a.expectedAnnualReturn ?? null,
            monthlyManagementCost: a.monthlyManagementCost ?? null,
            minimumMonthlyPayment: a.minimumMonthlyPayment ?? null,
            currencies: {
              create: a.currencies.map((c) => ({
                currency: c.currency,
                openingBalance: c.openingBalance,
                currentBalance: c.currentBalance
              }))
            }
          }
        });
        accountByName.set(a.name, created.id);
        result.accounts.created++;
      }

      // ---- Budget items (always appended; matching by name+amount+startDate
      //      avoids re-importing the same export twice) ----
      for (const b of payload.budgetItems) {
        const categoryId = categoryByKey.get(
          categoryKey(b.categoryGroupName, b.categoryName)
        );
        if (!categoryId) {
          result.warnings.push(
            `Budget item "${b.name}" skipped — category ${b.categoryGroupName}/${b.categoryName} not found`
          );
          result.budgetItems.skipped++;
          continue;
        }
        const accountId = b.accountName
          ? accountByName.get(b.accountName) ?? null
          : null;
        const incomeEarnerId = b.incomeEarnerName
          ? earnerByName.get(b.incomeEarnerName) ?? null
          : null;

        // Idempotency check: same name + amount + currency + startDate already?
        const dup = await tx.budgetLineItem.findFirst({
          where: {
            householdId,
            name: b.name,
            amount: b.amount,
            currency: b.currency,
            startDate: new Date(b.startDate),
            deletedAt: null
          }
        });
        if (dup) {
          result.budgetItems.skipped++;
          continue;
        }

        await tx.budgetLineItem.create({
          data: {
            householdId,
            name: b.name,
            itemType: b.itemType,
            amount: b.amount,
            currency: b.currency,
            recurrence: b.recurrence,
            startDate: new Date(b.startDate),
            endDate: b.endDate ? new Date(b.endDate) : null,
            debitDayOfMonth: b.debitDayOfMonth,
            expectedAnnualReturn: b.expectedAnnualReturn ?? null,
            monthlyManagementCost: b.monthlyManagementCost ?? null,
            notes: b.notes,
            active: b.active,
            categoryId,
            accountId,
            incomeEarnerId
          }
        });
        result.budgetItems.created++;
      }

      // ---- Transfers ----
      for (const t of payload.scheduledTransfers) {
        const sourceId = accountByName.get(t.sourceAccountName);
        const targetId = accountByName.get(t.targetAccountName);
        if (!sourceId || !targetId) {
          result.warnings.push(
            `Transfer "${t.name}" skipped — source/target account missing`
          );
          result.transfers.skipped++;
          continue;
        }
        const dup = await tx.scheduledTransfer.findFirst({
          where: {
            householdId,
            name: t.name,
            sourceAccountId: sourceId,
            targetAccountId: targetId,
            startDate: new Date(t.startDate),
            deletedAt: null
          }
        });
        if (dup) {
          result.transfers.skipped++;
          continue;
        }
        await tx.scheduledTransfer.create({
          data: {
            householdId,
            name: t.name,
            sourceAccountId: sourceId,
            sourceCurrency: t.sourceCurrency,
            targetAccountId: targetId,
            targetCurrency: t.targetCurrency,
            amount: t.amount,
            recurrence: t.recurrence,
            startDate: new Date(t.startDate),
            endDate: t.endDate ? new Date(t.endDate) : null,
            notes: t.notes,
            active: t.active
          }
        });
        result.transfers.created++;
      }

      // ---- Investment projections ----
      for (const p of payload.investmentProjections) {
        const accountId = p.accountName
          ? accountByName.get(p.accountName) ?? null
          : null;
        const dup = await tx.investmentProjection.findFirst({
          where: {
            householdId,
            name: p.name,
            startingCapital: p.startingCapital,
            currency: p.currency,
            deletedAt: null
          }
        });
        if (dup) {
          result.projections.skipped++;
          continue;
        }
        await tx.investmentProjection.create({
          data: {
            householdId,
            name: p.name,
            startingCapital: p.startingCapital,
            currency: p.currency,
            recurringContribution: p.recurringContribution,
            contributionFrequency: p.contributionFrequency,
            expectedAnnualReturn: p.expectedAnnualReturn,
            annualFeeDrag: p.annualFeeDrag,
            inflationRate: p.inflationRate,
            horizonYears: p.horizonYears,
            accountId
          }
        });
        result.projections.created++;
      }

      // ---- Assets (v2+) ----
      // v1 payloads don't include this section; tolerate the absence.
      const assetsList = payload.assets ?? [];
      for (const a of assetsList) {
        // Idempotency: same name + value + currency already present?
        const dup = await tx.asset.findFirst({
          where: {
            householdId,
            name: a.name,
            value: a.value,
            currency: a.currency,
            deletedAt: null
          }
        });
        if (dup) {
          result.assets.skipped++;
          continue;
        }
        await tx.asset.create({
          data: {
            householdId,
            name: a.name,
            category: a.category,
            value: a.value,
            currency: a.currency,
            annualAppreciationRate: a.annualAppreciationRate,
            acquiredAt: a.acquiredAt ? new Date(a.acquiredAt) : null,
            notes: a.notes,
            active: a.active
          }
        });
        result.assets.created++;
      }

      // Update household name + base currency only on replace mode — a merge
      // shouldn't silently change the active currency under the user's feet.
      if (mode === "replace") {
        await tx.household.update({
          where: { id: householdId },
          data: {
            name: payload.household.name,
            baseCurrency: payload.household.baseCurrency
          }
        });
      }
    },
    { timeout: 30_000 }
  );

  return result;
}
