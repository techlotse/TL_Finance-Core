import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, jsonOk, serialize } from "@/lib/api";
import { balanceSnapshotCreateSchema } from "@/lib/schemas";
import { getActiveHouseholdId } from "@/lib/household";
import { OwnershipError } from "@/lib/ownership";
import { writeAudit } from "@/lib/audit";
import { ipHashFromHeaders } from "@/lib/auth";

/**
 * GET /api/accounts/[id]/snapshots
 *
 * Lists balance snapshots for the account, newest first, joined to the
 * pocket so the UI can label rows with the right currency.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const householdId = await getActiveHouseholdId();
    const { id: accountId } = await params;

    // Tenant scope: confirm the account belongs to this household before
    // surfacing its history.
    const account = await prisma.bankAccount.findFirst({
      where: { id: accountId, householdId },
      select: { id: true }
    });
    if (!account) throw new OwnershipError("Account not found", 404);

    const snapshots = await prisma.balanceSnapshot.findMany({
      where: { accountCurrency: { accountId } },
      orderBy: { asOf: "desc" },
      include: {
        accountCurrency: { select: { currency: true } }
      },
      take: 200
    });
    return jsonOk(
      snapshots.map((s) => ({
        id: s.id,
        accountCurrencyId: s.accountCurrencyId,
        currency: s.accountCurrency.currency,
        balance: s.balance.toString(),
        asOf: s.asOf.toISOString(),
        note: s.note,
        createdAt: s.createdAt.toISOString()
      }))
    );
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * POST /api/accounts/[id]/snapshots
 *
 * Records a new actual-balance reading and atomically mirrors the value
 * onto BankAccountCurrency.currentBalance so forecasts pick it up
 * immediately. Each pocket gets at most one snapshot per submission.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const householdId = await getActiveHouseholdId();
    const { id: accountId } = await params;
    const body = balanceSnapshotCreateSchema.parse(await req.json());

    const result = await prisma.$transaction(async (tx) => {
      // Confirm the account belongs to this tenant — the inner pocket lookup
      // is then safe to do by id.
      const account = await tx.bankAccount.findFirst({
        where: { id: accountId, householdId },
        select: { id: true }
      });
      if (!account) throw new OwnershipError("Account not found", 404);

      const pocket = await tx.bankAccountCurrency.findFirst({
        where: { id: body.accountCurrencyId, accountId },
        select: { id: true, currency: true }
      });
      if (!pocket) {
        throw new OwnershipError(
          "Currency pocket not found on this account",
          404
        );
      }

      const asOf = body.asOf ? new Date(body.asOf) : new Date();

      const snapshot = await tx.balanceSnapshot.create({
        data: {
          accountCurrencyId: pocket.id,
          balance: body.balance,
          asOf,
          note: body.note ?? null
        }
      });

      // Mirror the reading onto the live pocket so the rest of the app
      // (dashboards, forecast, charts) reflects it without an extra query.
      await tx.bankAccountCurrency.update({
        where: { id: pocket.id },
        data: { currentBalance: body.balance }
      });

      return { snapshot, currency: pocket.currency };
    });

    await writeAudit({
      action: "create",
      householdId,
      resourceType: "balance_snapshot",
      resourceId: result.snapshot.id,
      ipHash: ipHashFromHeaders(req.headers),
      metadata: { accountId, currency: result.currency }
    });

    return jsonOk(
      serialize({
        id: result.snapshot.id,
        accountCurrencyId: result.snapshot.accountCurrencyId,
        currency: result.currency,
        balance: result.snapshot.balance.toString(),
        asOf: result.snapshot.asOf.toISOString(),
        note: result.snapshot.note,
        createdAt: result.snapshot.createdAt.toISOString()
      }),
      { status: 201 }
    );
  } catch (err) {
    return handleApiError(err);
  }
}
