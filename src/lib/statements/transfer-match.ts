import { toDecimal } from "@/lib/money";
import { getCountryProfile, type InternalFlowKind } from "@/lib/country-profiles";
import { flattenText, normalizeRawKeys } from "./category-rules";
import type { NormalizedTransactionRow } from "./types";

export interface InternalFlow {
  kind: InternalFlowKind;
  reason: string;
}

const REVOLUT_INTERNAL_TYPES = new Set(["topup", "top-up", "exchange"]);

/**
 * Decide whether a normalized row is an internal transfer / FX / settlement /
 * savings move that must be excluded from spending. Returns null for ordinary
 * income or spending.
 */
export function detectInternalFlow(
  row: NormalizedTransactionRow,
  options: { profileKey?: string | null; institution?: string | null } = {}
): InternalFlow | null {
  const profile = getCountryProfile(options.profileKey);
  const raw = normalizeRawKeys(row.raw ?? {});
  const revolutType = flattenText(raw.type ?? "");

  if (revolutType && REVOLUT_INTERNAL_TYPES.has(revolutType)) {
    return {
      kind: revolutType === "exchange" ? "fx" : "transfer",
      reason: revolutType === "exchange" ? "Currency exchange" : "Account top-up"
    };
  }

  const haystack = flattenText(
    [row.description, row.counterparty, row.reference, raw.beschreibung2, raw.beschreibung3]
      .filter(Boolean)
      .join(" ")
  );

  for (const signal of profile.internalSignals) {
    if (signal.patterns.some((p) => p.test(haystack))) {
      return { kind: signal.kind, reason: signal.reason };
    }
  }
  return null;
}

export interface TransferPair {
  debitIndex: number;
  creditIndex: number;
  confidence: string;
  reason: string;
}

interface PairableRow {
  amount: string;
  currency: string;
  bookingDate: string;
  accountKey: string;
}

/**
 * Best-effort pairing of equal-and-opposite rows across different accounts
 * within a short window — catches inter-account transfers between the
 * household's own accounts without needing the account holders' names.
 */
export function findTransferPairs(rows: PairableRow[], windowDays = 4): TransferPair[] {
  const pairs: TransferPair[] = [];
  const used = new Set<number>();
  const debits = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => toDecimal(r.amount).isNegative());

  for (const { r: debit, i: di } of debits) {
    if (used.has(di)) continue;
    const target = toDecimal(debit.amount).negated();
    let best = -1;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (let ci = 0; ci < rows.length; ci++) {
      if (ci === di || used.has(ci)) continue;
      const credit = rows[ci];
      if (credit.currency !== debit.currency) continue;
      if (credit.accountKey === debit.accountKey) continue;
      if (!toDecimal(credit.amount).equals(target)) continue;
      const delta = Math.abs(dayDelta(debit.bookingDate, credit.bookingDate));
      if (delta <= windowDays && delta < bestDelta) {
        best = ci;
        bestDelta = delta;
      }
    }
    if (best >= 0) {
      used.add(di);
      used.add(best);
      pairs.push({
        debitIndex: di,
        creditIndex: best,
        confidence: "0.900000",
        reason: "Equal and opposite amount across accounts within window"
      });
    }
  }
  return pairs;
}

function dayDelta(a: string, b: string): number {
  const da = Date.parse(a);
  const db = Date.parse(b);
  if (Number.isNaN(da) || Number.isNaN(db)) return Number.POSITIVE_INFINITY;
  return Math.round((da - db) / 86400000);
}
