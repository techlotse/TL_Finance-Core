import { NextRequest } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { handleApiError, jsonOk, serialize } from "@/lib/api";
import { ipHashFromHeaders } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { getActiveHouseholdId } from "@/lib/household";
import { assertAccountOwnership } from "@/lib/ownership";
import {
  createTransactionDedupeHash,
  parseStatementInput
} from "@/lib/statements";
import { readStatementImportRequest } from "@/lib/statements/request";

export const runtime = "nodejs";

export async function GET() {
  try {
    const householdId = await getActiveHouseholdId();
    const imports = await prisma.statementImport.findMany({
      where: { householdId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { account: { select: { id: true, name: true } } }
    });
    return jsonOk(serialize({ ok: true, value: imports }));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const householdId = await getActiveHouseholdId();
    const { input, parserKey, accountId } = await readStatementImportRequest(req);
    if (accountId) await assertAccountOwnership(householdId, accountId);

    const parsed = await parseStatementInput({ input, parserKey });
    if (parsed.rows.length === 0) {
      throw statusError("Statement did not contain importable rows", 422);
    }

    const pocketByCurrency = accountId
      ? await loadAccountCurrencyMap(householdId, accountId)
      : new Map<string, string>();
    if (accountId) {
      const missingCurrencies = Array.from(
        new Set(
          parsed.rows
            .map((row) => row.currency.toUpperCase())
            .filter((currency) => !pocketByCurrency.has(currency))
        )
      );
      if (missingCurrencies.length > 0) {
        throw statusError(
          `Selected account does not have currency pockets for: ${missingCurrencies.join(", ")}`,
          422
        );
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const statementImport = await tx.statementImport.upsert({
        where: {
          householdId_contentHash: {
            householdId,
            contentHash: input.contentHash
          }
        },
        create: {
          householdId,
          accountId: accountId ?? null,
          parserKey: parsed.parserKey,
          parserVersion: parsed.parserVersion,
          institution: parsed.institution,
          fileName: input.fileName ?? null,
          fileMimeType: input.mimeType ?? null,
          contentHash: input.contentHash,
          status: "committed",
          rowCount: parsed.rows.length,
          warningCount: parsed.warnings.length,
          warnings: parsed.warnings as unknown as Prisma.InputJsonValue,
          metadata: {
            accountName: parsed.accountName ?? null,
            accountIdentifier: parsed.accountIdentifier ?? null
          }
        },
        update: {
          accountId: accountId ?? null,
          parserKey: parsed.parserKey,
          parserVersion: parsed.parserVersion,
          institution: parsed.institution,
          fileName: input.fileName ?? null,
          fileMimeType: input.mimeType ?? null,
          status: "committed",
          rowCount: parsed.rows.length,
          warningCount: parsed.warnings.length,
          warnings: parsed.warnings as unknown as Prisma.InputJsonValue,
          metadata: {
            accountName: parsed.accountName ?? null,
            accountIdentifier: parsed.accountIdentifier ?? null
          }
        }
      });

      const inserted = await tx.actualTransaction.createMany({
        data: parsed.rows.map((row) => ({
          householdId,
          importId: statementImport.id,
          accountId: accountId ?? null,
          accountCurrencyId: accountId
            ? pocketByCurrency.get(row.currency.toUpperCase()) ?? null
            : null,
          institution: parsed.institution,
          bookingDate: new Date(row.bookingDate),
          valueDate: row.valueDate ? new Date(row.valueDate) : null,
          amount: row.amount,
          currency: row.currency.toUpperCase(),
          balanceAfter: row.balanceAfter ?? null,
          description: row.description,
          counterparty: row.counterparty ?? null,
          reference: row.reference ?? null,
          normalizedMerchantKey: row.normalizedMerchantKey ?? null,
          raw: row.raw,
          dedupeHash: createTransactionDedupeHash({
            householdId,
            accountId,
            institution: parsed.institution,
            row
          }),
          reviewState: "needs_review"
        })),
        skipDuplicates: true
      });

      const duplicateCount = parsed.rows.length - inserted.count;
      return tx.statementImport.update({
        where: { id: statementImport.id },
        data: {
          importedCount: inserted.count,
          duplicateCount
        },
        include: { account: { select: { id: true, name: true } } }
      });
    });

    await writeAudit({
      action: "statement_import_commit",
      householdId,
      resourceType: "statement_import",
      resourceId: result.id,
      ipHash: ipHashFromHeaders(req.headers),
      metadata: {
        parserKey: result.parserKey,
        institution: result.institution,
        rowCount: result.rowCount,
        importedCount: result.importedCount,
        duplicateCount: result.duplicateCount
      }
    });

    return jsonOk(serialize({ ok: true, value: result }), { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

async function loadAccountCurrencyMap(
  householdId: string,
  accountId: string
): Promise<Map<string, string>> {
  const pockets = await prisma.bankAccountCurrency.findMany({
    where: { accountId, account: { householdId } },
    select: { id: true, currency: true }
  });
  return new Map(pockets.map((pocket) => [pocket.currency.toUpperCase(), pocket.id]));
}

function statusError(message: string, status: number): Error {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}
