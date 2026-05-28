import { createHash } from "node:crypto";
import { Decimal, decimalString, toDecimal } from "@/lib/money";
import type { NormalizedTransactionRow, StatementInput } from "./types";

export function createStatementInput({
  fileName,
  mimeType,
  text,
  bytes,
  defaultCurrency
}: {
  fileName?: string | null;
  mimeType?: string | null;
  text?: string | null;
  bytes?: Uint8Array | null;
  defaultCurrency?: string | null;
}): StatementInput {
  const normalizedBytes =
    bytes ?? (text !== undefined && text !== null ? Buffer.from(text, "utf8") : null);
  return {
    fileName: fileName ?? null,
    mimeType: mimeType ?? null,
    text: text ?? null,
    bytes: normalizedBytes,
    contentHash: sha256Bytes(normalizedBytes ?? Buffer.alloc(0)),
    defaultCurrency: defaultCurrency?.trim().toUpperCase() ?? null
  };
}

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function normalizeHeader(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function normalizeMerchantKey(value: string | null | undefined): string | null {
  const normalized = normalizeText(value ?? "")
    .replace(/\b\d{2,}\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return normalized || null;
}

export function normalizeText(value: string): string {
  return value.normalize("NFKD").toLowerCase().trim();
}

export function parseDateToIsoDate(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return validIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    return validIsoDate(Number(compact[1]), Number(compact[2]), Number(compact[3]));
  }

  const dotted = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
  if (dotted) {
    const year = Number(dotted[3].length === 2 ? `20${dotted[3]}` : dotted[3]);
    return validIsoDate(year, Number(dotted[2]), Number(dotted[1]));
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export function parseMoneyToDecimalString(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;

  const isParenthesized = raw.startsWith("(") && raw.endsWith(")");
  const isTrailingMinus = raw.endsWith("-");
  const negative =
    isParenthesized || isTrailingMinus || raw.replace(/\s/g, "").startsWith("-");
  let cleaned = raw
    .replace(/[()]/g, "")
    .replace(/[A-Z]{3}/gi, "")
    .replace(/[^\d,.'\-]/g, "")
    .replace(/'/g, "")
    .replace(/\s/g, "");

  if (isTrailingMinus) cleaned = cleaned.slice(0, -1);
  cleaned = cleaned.replace(/^-/, "");
  if (!cleaned) return null;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  const decimalSeparator =
    lastComma >= 0 && lastDot >= 0
      ? lastComma > lastDot
        ? ","
        : "."
      : lastComma >= 0
        ? ","
        : ".";

  const thousandsSeparator = decimalSeparator === "," ? "." : ",";
  const normalized = cleaned
    .replace(new RegExp(`\\${thousandsSeparator}`, "g"), "")
    .replace(decimalSeparator, ".");

  try {
    const amount = toDecimal(normalized);
    return decimalString(negative ? amount.negated() : amount);
  } catch {
    return null;
  }
}

export function createTransactionDedupeHash({
  householdId,
  accountId,
  institution,
  row
}: {
  householdId: string;
  accountId?: string | null;
  institution: string;
  row: NormalizedTransactionRow;
}): string {
  const parts = [
    householdId,
    accountId ?? "",
    institution,
    row.bookingDate,
    row.valueDate ?? "",
    row.amount,
    row.currency.toUpperCase(),
    normalizeText(row.reference ?? ""),
    normalizeText(row.description),
    normalizeText(row.counterparty ?? "")
  ];
  return createHash("sha256").update(parts.join("\u001f")).digest("hex");
}

export function sumRows(rows: NormalizedTransactionRow[]): Decimal {
  return rows.reduce((sum, row) => sum.plus(toDecimal(row.amount)), new Decimal(0));
}

function validIsoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}
