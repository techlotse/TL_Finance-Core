import { prisma } from "@/lib/prisma";
import { getActiveHouseholdForPage } from "@/lib/page-auth";
import { convertManyToBase } from "@/lib/exchange-rates";
import { Decimal } from "@/lib/money";
import { PageHeader } from "@/components/page-header";
import { AnalysisClient, type AnalysisTxn, type ImportRow } from "./analysis-client";

export const dynamic = "force-dynamic";

const MAX_SUMMARY_ROWS = 5000;
const MAX_TABLE_ROWS = 300;

export default async function AnalysisPage() {
  const household = await getActiveHouseholdForPage("/analysis");
  const base = household.baseCurrency;

  const [accounts, txns, imports] = await Promise.all([
    prisma.bankAccount.findMany({
      where: { householdId: household.id, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" }
    }),
    prisma.actualTransaction.findMany({
      where: { householdId: household.id },
      orderBy: [{ bookingDate: "desc" }, { id: "desc" }],
      take: MAX_SUMMARY_ROWS,
      select: {
        id: true,
        bookingDate: true,
        amount: true,
        currency: true,
        description: true,
        reviewState: true,
        notes: true,
        account: { select: { name: true } },
        category: { select: { name: true } }
      }
    }),
    prisma.statementImport.findMany({
      where: { householdId: household.id },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        parserKey: true,
        institution: true,
        fileName: true,
        importedCount: true,
        duplicateCount: true,
        warningCount: true,
        createdAt: true
      }
    })
  ]);

  // Base-currency summary, excluding internal transfers / FX (reviewState ignored).
  const active = txns.filter((t) => t.reviewState !== "ignored");
  const inItems = active
    .filter((t) => new Decimal(t.amount.toString()).greaterThan(0))
    .map((t) => ({ amount: t.amount.toString(), currency: t.currency }));
  const outItems = active
    .filter((t) => new Decimal(t.amount.toString()).lessThan(0))
    .map((t) => ({ amount: t.amount.toString(), currency: t.currency }));
  const internalItems = txns
    .filter((t) => t.reviewState === "ignored")
    .map((t) => ({ amount: new Decimal(t.amount.toString()).abs().toString(), currency: t.currency }));

  let moneyIn = "0";
  let moneyOut = "0";
  let internal = "0";
  let stale: string[] = [];
  try {
    const [i, o, n] = await Promise.all([
      convertManyToBase(inItems, base),
      convertManyToBase(outItems, base),
      convertManyToBase(internalItems, base)
    ]);
    moneyIn = i.total.toFixed(2);
    moneyOut = o.total.toFixed(2);
    internal = n.total.toFixed(2);
    stale = Array.from(new Set([...i.staleCurrencies, ...o.staleCurrencies, ...n.staleCurrencies]));
  } catch {
    // FX unavailable — fall back to native sums (correct when single-currency).
    const sum = (items: { amount: string }[]) =>
      items.reduce((acc, x) => acc.plus(new Decimal(x.amount)), new Decimal(0));
    moneyIn = sum(inItems).toFixed(2);
    moneyOut = sum(outItems).toFixed(2);
    internal = sum(internalItems).toFixed(2);
  }

  const tableTxns: AnalysisTxn[] = txns.slice(0, MAX_TABLE_ROWS).map((t) => ({
    id: t.id,
    date: t.bookingDate.toISOString().slice(0, 10),
    description: t.description,
    account: t.account?.name ?? null,
    category: t.category?.name ?? null,
    amount: t.amount.toString(),
    currency: t.currency,
    reviewState: t.reviewState,
    notes: t.notes ?? null
  }));

  const importRows: ImportRow[] = imports.map((im) => ({
    id: im.id,
    parserKey: im.parserKey,
    institution: im.institution,
    fileName: im.fileName,
    importedCount: im.importedCount,
    duplicateCount: im.duplicateCount,
    warningCount: im.warningCount,
    createdAt: im.createdAt.toISOString()
  }));

  return (
    <>
      <PageHeader
        title="Analysis"
        description="Import bank & card statements, then see actual money in, out and across accounts. Inter-account transfers and currency exchanges are detected and excluded from spending."
      />
      <AnalysisClient
        baseCurrency={base}
        accounts={accounts}
        transactions={tableTxns}
        imports={importRows}
        summary={{
          moneyIn,
          moneyOut,
          net: new Decimal(moneyIn).plus(new Decimal(moneyOut)).toFixed(2),
          internal,
          stale,
          txnCount: txns.length
        }}
      />
    </>
  );
}
