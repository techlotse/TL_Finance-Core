import { prisma } from "./prisma";

/**
 * Foreign-key ownership checks. Every POST / PATCH that accepts an `accountId`
 * / `categoryId` / `incomeEarnerId` / `groupId` etc. in its body must call the
 * matching helper here BEFORE writing — otherwise a tenant could attach their
 * own row to another tenant's record by guessing IDs. (Cuid IDs are unguessable
 * in practice but the integrity guarantee should not depend on that.)
 *
 * Each helper throws OwnershipError(404) when the row does not belong to the
 * caller's household, mapped by handleApiError to a clean 404.
 */

export class OwnershipError extends Error {
  status: number;
  constructor(message: string, status = 404) {
    super(message);
    this.status = status;
    this.name = "OwnershipError";
  }
}

export async function assertCategoryOwnership(
  householdId: string,
  categoryId: string
): Promise<void> {
  const cat = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { householdId: true }
  });
  if (!cat || cat.householdId !== householdId) {
    throw new OwnershipError("Category not found", 404);
  }
}

export async function assertCategoryGroupOwnership(
  householdId: string,
  groupId: string
): Promise<void> {
  const grp = await prisma.categoryGroup.findUnique({
    where: { id: groupId },
    select: { householdId: true }
  });
  if (!grp || grp.householdId !== householdId) {
    throw new OwnershipError("Category group not found", 404);
  }
}

export async function assertAccountOwnership(
  householdId: string,
  accountId: string
): Promise<void> {
  const acc = await prisma.bankAccount.findUnique({
    where: { id: accountId },
    select: { householdId: true }
  });
  if (!acc || acc.householdId !== householdId) {
    throw new OwnershipError("Account not found", 404);
  }
}

export async function assertIncomeEarnerOwnership(
  householdId: string,
  earnerId: string
): Promise<void> {
  const ie = await prisma.incomeEarner.findUnique({
    where: { id: earnerId },
    select: { householdId: true }
  });
  if (!ie || ie.householdId !== householdId) {
    throw new OwnershipError("Income earner not found", 404);
  }
}

/**
 * Convenience: validate a budget-item-shaped body's foreign keys in parallel.
 * Skips fields that are undefined (PATCH semantics).
 */
export async function assertBudgetItemFkOwnership(
  householdId: string,
  fks: {
    categoryId?: string;
    accountId?: string | null;
    incomeEarnerId?: string | null;
  }
): Promise<void> {
  const checks: Promise<void>[] = [];
  if (fks.categoryId) checks.push(assertCategoryOwnership(householdId, fks.categoryId));
  if (fks.accountId) checks.push(assertAccountOwnership(householdId, fks.accountId));
  if (fks.incomeEarnerId)
    checks.push(assertIncomeEarnerOwnership(householdId, fks.incomeEarnerId));
  await Promise.all(checks);
}

export async function assertTransferFkOwnership(
  householdId: string,
  fks: {
    sourceAccountId?: string;
    sourceCurrency?: string;
    targetAccountId?: string;
    targetCurrency?: string;
  }
): Promise<void> {
  const checks: Promise<void>[] = [];
  if (fks.sourceAccountId)
    checks.push(assertAccountOwnership(householdId, fks.sourceAccountId));
  if (fks.targetAccountId)
    checks.push(assertAccountOwnership(householdId, fks.targetAccountId));
  if (fks.sourceAccountId && fks.sourceCurrency) {
    checks.push(
      assertAccountCurrencyOwnership(
        householdId,
        fks.sourceAccountId,
        fks.sourceCurrency,
        "Source currency not found on account"
      )
    );
  }
  if (fks.targetAccountId && fks.targetCurrency) {
    checks.push(
      assertAccountCurrencyOwnership(
        householdId,
        fks.targetAccountId,
        fks.targetCurrency,
        "Target currency not found on account"
      )
    );
  }
  await Promise.all(checks);
}

export async function assertAccountCurrencyOwnership(
  householdId: string,
  accountId: string,
  currency: string,
  message = "Account currency not found"
): Promise<void> {
  const pocket = await prisma.bankAccountCurrency.findFirst({
    where: {
      accountId,
      currency: currency.toUpperCase(),
      account: { householdId }
    },
    select: { id: true }
  });
  if (!pocket) throw new OwnershipError(message, 404);
}
