import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, jsonError, jsonOk, serialize } from "@/lib/api";
import { accountPatchSchema } from "@/lib/schemas";
import { getActiveHouseholdId } from "@/lib/household";
import { OwnershipError } from "@/lib/ownership";
import { writeAudit } from "@/lib/audit";
import { ipHashFromHeaders } from "@/lib/auth";
import { effectiveMonthlyCostCurrency } from "@/lib/account-currency";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const householdId = await getActiveHouseholdId();
    const { id } = await params;
    const body = accountPatchSchema.parse(await req.json());

    // Update scalar fields and, if `currencies` is provided, replace pockets
    // — all in a transaction so a partial replacement can't leave the account
    // in an inconsistent state. Tenant scope is enforced by a findFirst at
    // the top of the transaction; subsequent writes use the bare id.
    const updated = await prisma.$transaction(async (tx) => {
      const found = await tx.bankAccount.findFirst({
        where: { id, householdId },
        select: {
          id: true,
          monthlyCost: true,
          monthlyCostCurrency: true,
          currencies: {
            select: { currency: true },
            orderBy: { createdAt: "asc" }
          }
        }
      });
      if (!found) throw new OwnershipError("Account not found", 404);
      const nextCurrencies = body.currencies ?? found.currencies;
      const nextCostCurrencyInput =
        body.monthlyCostCurrency === undefined
          ? found.monthlyCostCurrency
          : body.monthlyCostCurrency;
      const shouldResolveMonthlyCostCurrency =
        body.monthlyCost !== undefined ||
        body.monthlyCostCurrency !== undefined ||
        (body.currencies !== undefined && found.monthlyCost !== null);
      const nextMonthlyCostCurrency =
        body.monthlyCost === null
          ? null
          : shouldResolveMonthlyCostCurrency
            ? effectiveMonthlyCostCurrency(
                {
                  monthlyCostCurrency: nextCostCurrencyInput,
                  currencies: nextCurrencies
                },
                "CHF"
              )
            : undefined;

      await tx.bankAccount.update({
        where: { id },
        data: {
          name: body.name,
          institution: body.institution,
          accountType: body.accountType,
          notes: body.notes,
          active: body.active,
          monthlyCost: body.monthlyCost,
          monthlyCostCurrency: nextMonthlyCostCurrency,
          annualInterestRate: body.annualInterestRate,
          expectedAnnualReturn: body.expectedAnnualReturn,
          monthlyManagementCost: body.monthlyManagementCost,
          minimumMonthlyPayment: body.minimumMonthlyPayment
        }
      });

      if (body.currencies) {
        const existing = await tx.bankAccountCurrency.findMany({
          where: { accountId: id }
        });
        const next = new Map(
          body.currencies.map((c) => [c.currency.toUpperCase(), c])
        );

        for (const e of existing) {
          if (!next.has(e.currency.toUpperCase())) {
            await tx.bankAccountCurrency.delete({ where: { id: e.id } });
          }
        }
        for (const [cur, c] of next) {
          await tx.bankAccountCurrency.upsert({
            where: {
              accountId_currency: { accountId: id, currency: cur }
            },
            create: {
              accountId: id,
              currency: cur,
              openingBalance: c.openingBalance,
              currentBalance: c.currentBalance ?? c.openingBalance
            },
            update: {
              openingBalance: c.openingBalance,
              currentBalance: c.currentBalance ?? c.openingBalance
            }
          });
        }
      }

      return tx.bankAccount.findUniqueOrThrow({
        where: { id },
        include: { currencies: true }
      });
    });

    await writeAudit({
      action: "update",
      householdId,
      resourceType: "account",
      resourceId: id,
      ipHash: ipHashFromHeaders(req.headers)
    });

    return jsonOk(serialize(updated));
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * Soft-delete by default — sets active=false and deletedAt so the row stays
 * around for historical forecast/audit work. `?force=true` opt-in performs a
 * hard delete (only succeeds if no FKs would be violated).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const householdId = await getActiveHouseholdId();
    const { id } = await params;
    const url = new URL(req.url);
    const force = url.searchParams.get("force") === "true";

    const found = await prisma.bankAccount.findFirst({
      where: { id, householdId },
      select: { id: true }
    });
    if (!found) throw new OwnershipError("Account not found", 404);

    if (force) {
      // Refuse if any budget item or transfer still references this account —
      // otherwise we lose history. The user can reassign first or fall back
      // to soft-delete.
      const refs = await prisma.$transaction([
        prisma.budgetLineItem.count({ where: { accountId: id } }),
        prisma.scheduledTransfer.count({
          where: {
            OR: [{ sourceAccountId: id }, { targetAccountId: id }]
          }
        })
      ]);
      const total = refs[0] + refs[1];
      if (total > 0) {
        return jsonError(
          "Account is referenced by budget items or transfers — soft-delete instead",
          409
        );
      }
      await prisma.bankAccount.deleteMany({
        where: { id, householdId }
      });

      await writeAudit({
        action: "delete",
        householdId,
        resourceType: "account",
        resourceId: id,
        ipHash: ipHashFromHeaders(req.headers)
      });
      return jsonOk({ ok: true, deleted: true });
    }

    const result = await prisma.bankAccount.updateMany({
      where: { id, householdId, deletedAt: null },
      data: { active: false, deletedAt: new Date() }
    });
    if (result.count === 0) throw new OwnershipError("Account not found", 404);

    await writeAudit({
      action: "soft_delete",
      householdId,
      resourceType: "account",
      resourceId: id,
      ipHash: ipHashFromHeaders(req.headers)
    });

    const after = await prisma.bankAccount.findUniqueOrThrow({
      where: { id },
      include: { currencies: true }
    });
    return jsonOk(serialize(after));
  } catch (err) {
    return handleApiError(err);
  }
}
