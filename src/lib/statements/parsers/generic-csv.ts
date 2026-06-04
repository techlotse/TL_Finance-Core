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

const DATE_HEADERS = ["date", "booking_date", "transaction_date", "posted_date"];
const VALUE_DATE_HEADERS = ["value_date", "valuta"];
const DESCRIPTION_HEADERS = ["description", "details", "narrative", "text", "merchant"];
const COUNTERPARTY_HEADERS = ["counterparty", "beneficiary", "payee", "payer"];
const REFERENCE_HEADERS = ["reference", "transaction_id", "id", "ref"];
const AMOUNT_HEADERS = ["amount", "transaction_amount", "value"];
const DEBIT_HEADERS = ["debit", "money_out", "paid_out", "withdrawal"];
const CREDIT_HEADERS = ["credit", "money_in", "paid_in", "deposit"];
const CURRENCY_HEADERS = ["currency", "ccy"];
const BALANCE_HEADERS = ["balance", "balance_after", "running_balance"];

export const genericCsvParser: StatementParser = {
  key: "generic-csv",
  institution: "generic",
  detect(input: StatementInput): ParserDetection {
    if (!input.text) {
      return { matched: false, confidence: 0, reason: "No text content" };
    }
    const rows = parseDelimitedText(input.text);
    if (rows.length < 2) {
      return { matched: false, confidence: 0, reason: "Not enough rows" };
    }
    const headers = rows[0].map(normalizeHeader);
    const hasDate = findHeader(headers, DATE_HEADERS) >= 0;
    const hasDescription = findHeader(headers, DESCRIPTION_HEADERS) >= 0;
    const hasAmount =
      findHeader(headers, AMOUNT_HEADERS) >= 0 ||
      findHeader(headers, DEBIT_HEADERS) >= 0 ||
      findHeader(headers, CREDIT_HEADERS) >= 0;
    const matched = hasDate && hasDescription && hasAmount;
    return {
      matched,
      confidence: matched ? 0.55 : 0,
      reason: matched
        ? "Delimited text has date, description, and amount-like headers"
        : "Missing date, description, or amount-like headers"
    };
  },
  async parse(input: StatementInput): Promise<NormalizedStatement> {
    if (!input.text) {
      throw statusError("Generic CSV parser requires text content", 422);
    }
    const table = parseDelimitedText(input.text);
    if (table.length < 2) {
      throw statusError("Statement does not contain transaction rows", 422);
    }

    const rawHeaders = table[0].map((header) => header.trim());
    const headers = rawHeaders.map(normalizeHeader);
    const indexes = {
      date: requiredHeader(headers, DATE_HEADERS, "date"),
      valueDate: findHeader(headers, VALUE_DATE_HEADERS),
      description: requiredHeader(headers, DESCRIPTION_HEADERS, "description"),
      counterparty: findHeader(headers, COUNTERPARTY_HEADERS),
      reference: findHeader(headers, REFERENCE_HEADERS),
      amount: findHeader(headers, AMOUNT_HEADERS),
      debit: findHeader(headers, DEBIT_HEADERS),
      credit: findHeader(headers, CREDIT_HEADERS),
      currency: findHeader(headers, CURRENCY_HEADERS),
      balance: findHeader(headers, BALANCE_HEADERS)
    };
    if (indexes.amount < 0 && indexes.debit < 0 && indexes.credit < 0) {
      throw statusError("Statement needs amount or debit/credit columns", 422);
    }

    const rows: NormalizedTransactionRow[] = [];
    const warnings: StatementWarning[] = [];

    for (let i = 1; i < table.length; i++) {
      const record = table[i];
      const rowNumber = i + 1;
      if (record.every((cell) => cell.trim() === "")) continue;
      const raw = rawObject(rawHeaders, record);
      const bookingDate = parseDateToIsoDate(cell(record, indexes.date));
      const description = cell(record, indexes.description).trim();
      const currency =
        (indexes.currency >= 0 ? cell(record, indexes.currency) : input.defaultCurrency ?? "")
          .trim()
          .toUpperCase();
      const amount = parseAmount(record, indexes);

      if (!bookingDate) {
        warnings.push({
          code: "invalid_date",
          message: "Row skipped because booking date could not be parsed",
          rowNumber,
          field: "bookingDate"
        });
        continue;
      }
      if (!description) {
        warnings.push({
          code: "missing_description",
          message: "Row skipped because description is empty",
          rowNumber,
          field: "description"
        });
        continue;
      }
      if (!currency) {
        warnings.push({
          code: "missing_currency",
          message: "Row skipped because no currency column or default currency was supplied",
          rowNumber,
          field: "currency"
        });
        continue;
      }
      if (!amount) {
        warnings.push({
          code: "invalid_amount",
          message: "Row skipped because amount could not be parsed",
          rowNumber,
          field: "amount"
        });
        continue;
      }

      const valueDate =
        indexes.valueDate >= 0 ? parseDateToIsoDate(cell(record, indexes.valueDate)) : null;
      const balanceAfter =
        indexes.balance >= 0 ? parseMoneyToDecimalString(cell(record, indexes.balance)) : null;
      rows.push({
        bookingDate,
        valueDate,
        amount,
        currency,
        description,
        counterparty:
          indexes.counterparty >= 0 ? cell(record, indexes.counterparty).trim() || null : null,
        reference:
          indexes.reference >= 0 ? cell(record, indexes.reference).trim() || null : null,
        balanceAfter,
        normalizedMerchantKey: normalizeMerchantKey(description),
        raw
      });
    }

    return {
      parserKey: genericCsvParser.key,
      parserVersion: STATEMENT_PARSER_VERSION,
      institution: "generic",
      rows,
      warnings
    };
  }
};

export function parseDelimitedText(text: string): string[][] {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cellValue = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        cellValue += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && char === delimiter) {
      row.push(cellValue);
      cellValue = "";
      continue;
    }
    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") i++;
      row.push(cellValue);
      rows.push(row);
      row = [];
      cellValue = "";
      continue;
    }
    cellValue += char;
  }

  row.push(cellValue);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [",", ";", "\t"];
  return candidates
    .map((delimiter) => ({
      delimiter,
      count: sample.split(delimiter).length - 1
    }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter ?? ",";
}

function parseAmount(
  record: string[],
  indexes: { amount: number; debit: number; credit: number }
): string | null {
  if (indexes.amount >= 0) return parseMoneyToDecimalString(cell(record, indexes.amount));

  const debit =
    indexes.debit >= 0 ? parseMoneyToDecimalString(cell(record, indexes.debit)) : null;
  const credit =
    indexes.credit >= 0 ? parseMoneyToDecimalString(cell(record, indexes.credit)) : null;
  if (!debit && !credit) return null;

  const amount = toDecimal(credit ?? "0").minus(toDecimal(debit ?? "0"));
  return decimalString(amount);
}

function findHeader(headers: string[], aliases: string[]): number {
  return headers.findIndex((header) => aliases.includes(header));
}

function requiredHeader(headers: string[], aliases: string[], label: string): number {
  const index = findHeader(headers, aliases);
  if (index < 0) throw statusError(`Statement is missing ${label} column`, 422);
  return index;
}

function cell(record: string[], index: number): string {
  return index >= 0 ? record[index] ?? "" : "";
}

function rawObject(headers: string[], record: string[]): Record<string, string> {
  const raw: Record<string, string> = {};
  headers.forEach((header, index) => {
    raw[header || `column_${index + 1}`] = record[index] ?? "";
  });
  return raw;
}

function statusError(message: string, status: number): Error {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}
