import { decimalString, toDecimal } from "@/lib/money";
import {
  normalizeHeader,
  normalizeMerchantKey,
  parseDateToIsoDate,
  parseMoneyToDecimalString
} from "../normalize";
import {
  STATEMENT_PARSER_VERSION,
  type NormalizedStatement,
  type NormalizedTransactionRow,
  type ParserDetection,
  type StatementInput,
  type StatementParser,
  type StatementWarning
} from "../types";
import { parseDelimitedText } from "./generic-csv";

// Revolut "Account Statement (per currency)" CSV.
// Header: Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
// Real exports use Title-Case Type values ("Card Payment", "Topup",
// "Card Refund", "Charge") — not the UPPER_SNAKE forms.
const REQUIRED = ["type", "started_date", "amount", "currency", "state"];

function indexOfHeader(headers: string[], name: string): number {
  return headers.indexOf(name);
}

export const revolutCsvParser: StatementParser = {
  key: "revolut-csv",
  institution: "revolut",
  detect(input: StatementInput): ParserDetection {
    if (!input.text) return { matched: false, confidence: 0, reason: "No text content" };
    const table = parseDelimitedText(input.text);
    if (table.length < 2) return { matched: false, confidence: 0, reason: "Not enough rows" };
    const headers = table[0].map(normalizeHeader);
    const hasAll = REQUIRED.every((h) => headers.includes(h));
    if (!hasAll) {
      return { matched: false, confidence: 0, reason: "Missing Revolut Type/State/Amount/Currency headers" };
    }
    const hasProduct = headers.includes("product");
    const hasCompleted = headers.includes("completed_date");
    return {
      matched: true,
      confidence: hasProduct && hasCompleted ? 0.97 : 0.85,
      reason: "Revolut per-currency CSV (Type/Started Date/Amount/Currency/State)"
    };
  },
  async parse(input: StatementInput): Promise<NormalizedStatement> {
    if (!input.text) throw statusError("Revolut parser requires text content", 422);
    const table = parseDelimitedText(input.text);
    if (table.length < 2) throw statusError("Statement does not contain transaction rows", 422);

    const rawHeaders = table[0].map((h) => h.trim());
    const headers = rawHeaders.map(normalizeHeader);
    const idx = {
      type: indexOfHeader(headers, "type"),
      started: indexOfHeader(headers, "started_date"),
      completed: indexOfHeader(headers, "completed_date"),
      description: indexOfHeader(headers, "description"),
      amount: indexOfHeader(headers, "amount"),
      fee: indexOfHeader(headers, "fee"),
      currency: indexOfHeader(headers, "currency"),
      state: indexOfHeader(headers, "state"),
      balance: indexOfHeader(headers, "balance")
    };

    const rows: NormalizedTransactionRow[] = [];
    const warnings: StatementWarning[] = [];

    for (let i = 1; i < table.length; i++) {
      const record = table[i];
      const rowNumber = i + 1;
      if (record.every((c) => c.trim() === "")) continue;
      const raw = rawObject(rawHeaders, record);
      const state = (cell(record, idx.state) || "").trim().toUpperCase();

      if (state === "PENDING") {
        warnings.push({ code: "pending_row", message: "Pending row skipped", rowNumber });
        continue;
      }
      if (state === "REVERTED") {
        warnings.push({ code: "reversed_row", message: "Reverted row skipped (original retained by Revolut)", rowNumber });
        continue;
      }
      if (state && state !== "COMPLETED") {
        warnings.push({ code: "non_completed_row", message: `Row skipped in state ${state}`, rowNumber });
        continue;
      }

      const bookingDate =
        parseDateToIsoDate(cell(record, idx.completed)) ?? parseDateToIsoDate(cell(record, idx.started));
      const baseAmount = parseMoneyToDecimalString(cell(record, idx.amount));
      const fee = idx.fee >= 0 ? parseMoneyToDecimalString(cell(record, idx.fee)) : null;
      const currency = (cell(record, idx.currency) || input.defaultCurrency || "").trim().toUpperCase();
      const description = (cell(record, idx.description) || cell(record, idx.type) || "").trim();

      if (!bookingDate) {
        warnings.push({ code: "invalid_date", message: "Row skipped: unparseable date", rowNumber, field: "bookingDate" });
        continue;
      }
      if (!baseAmount) {
        warnings.push({ code: "invalid_amount", message: "Row skipped: unparseable amount", rowNumber, field: "amount" });
        continue;
      }
      if (!currency) {
        warnings.push({ code: "missing_currency", message: "Row skipped: no currency", rowNumber, field: "currency" });
        continue;
      }

      // Fees are a cost: subtract the (positive) fee from the signed amount.
      const net = fee ? toDecimal(baseAmount).minus(toDecimal(fee).abs()) : toDecimal(baseAmount);
      rows.push({
        bookingDate,
        valueDate: parseDateToIsoDate(cell(record, idx.started)),
        amount: decimalString(net),
        currency,
        description: description || "(no description)",
        counterparty: null,
        reference: null,
        balanceAfter: idx.balance >= 0 ? parseMoneyToDecimalString(cell(record, idx.balance)) : null,
        normalizedMerchantKey: normalizeMerchantKey(description),
        raw
      });
    }

    return {
      parserKey: revolutCsvParser.key,
      parserVersion: STATEMENT_PARSER_VERSION,
      institution: "revolut",
      accountIdentifier: rows[0]?.currency ? `Revolut ${rows[0].currency}` : null,
      rows,
      warnings
    };
  }
};

function cell(record: string[], index: number): string {
  return index >= 0 ? record[index] ?? "" : "";
}
function rawObject(headers: string[], record: string[]): Record<string, string> {
  const raw: Record<string, string> = {};
  headers.forEach((h, i) => {
    raw[h || `column_${i + 1}`] = record[i] ?? "";
  });
  return raw;
}
function statusError(message: string, status: number): Error {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}
