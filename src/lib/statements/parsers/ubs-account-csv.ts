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

// UBS e-banking current / savings ACCOUNT CSV export (not camt.053, not the
// card export). Structure: ~8 metadata lines (Kontonummer / IBAN / Von / Bis /
// Anfangssaldo / Schlusssaldo / ...), a blank line, then the column header:
//   Abschlussdatum;Abschlusszeit;Buchungsdatum;Valutadatum;Währung;Belastung;
//   Gutschrift;Einzelbetrag;Saldo;Transaktions-Nr.;Beschreibung1;Beschreibung2;
//   Beschreibung3;Fussnoten
// Belastung carries its own minus sign; Gutschrift is positive.
const DATE_ALIASES = ["buchungsdatum", "abschlussdatum"];
const CCY_ALIASES = ["wa_hrung", "wahrung", "currency"];

function findIdx(headers: string[], names: string[]): number {
  return headers.findIndex((h) => names.includes(h));
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export const ubsAccountCsvParser: StatementParser = {
  key: "ubs-account-csv",
  institution: "ubs",
  detect(input: StatementInput): ParserDetection {
    const text = input.text ?? "";
    if (!text) return { matched: false, confidence: 0, reason: "No text content" };
    const lower = text.toLowerCase();
    const looksLikeAccount =
      lower.includes("beschreibung1") &&
      lower.includes("belastung") &&
      lower.includes("gutschrift") &&
      (lower.includes("buchungsdatum") || lower.includes("saldo"));
    if (!looksLikeAccount) {
      return { matched: false, confidence: 0, reason: "No UBS account header (Beschreibung1/Saldo/Belastung)" };
    }
    return {
      matched: true,
      confidence: 0.97,
      reason: "UBS account CSV (Beschreibung1 + Belastung/Gutschrift/Saldo)"
    };
  },
  async parse(input: StatementInput): Promise<NormalizedStatement> {
    const text = stripBom(input.text ?? "");
    const table = parseDelimitedText(text);
    const headerIndex = table.findIndex((r) =>
      r.some((c) => normalizeHeader(c) === "beschreibung1") &&
      r.some((c) => normalizeHeader(c) === "belastung")
    );
    if (headerIndex < 0) throw statusError("UBS account CSV header row not found", 422);

    // Metadata lines above the header: "Key:;value;"
    let accountIdentifier: string | null = null;
    for (let i = 0; i < headerIndex; i++) {
      const key = (table[i][0] ?? "").trim().toLowerCase();
      const value = (table[i][1] ?? "").trim();
      if (key.startsWith("iban") && value) accountIdentifier = value;
    }

    const rawHeaders = table[headerIndex].map((h) => h.trim());
    const headers = rawHeaders.map(normalizeHeader);
    const idx = {
      date: findIdx(headers, DATE_ALIASES),
      value: headers.indexOf("valutadatum"),
      currency: findIdx(headers, CCY_ALIASES),
      debit: headers.indexOf("belastung"),
      credit: headers.indexOf("gutschrift"),
      single: headers.indexOf("einzelbetrag"),
      balance: headers.indexOf("saldo"),
      reference: headers.indexOf("transaktions_nr"),
      b1: headers.indexOf("beschreibung1"),
      b2: headers.indexOf("beschreibung2"),
      b3: headers.indexOf("beschreibung3")
    };
    if (idx.date < 0 || (idx.debit < 0 && idx.credit < 0)) {
      throw statusError("UBS account CSV missing date or amount columns", 422);
    }

    const rows: NormalizedTransactionRow[] = [];
    const warnings: StatementWarning[] = [];

    for (let i = headerIndex + 1; i < table.length; i++) {
      const record = table[i];
      const rowNumber = i + 1;
      if (record.every((c) => c.trim() === "")) continue;

      const raw = rawObject(rawHeaders, record);
      const bookingDate = parseDateToIsoDate(cell(record, idx.date));
      const debit = idx.debit >= 0 ? parseMoneyToDecimalString(cell(record, idx.debit)) : null;
      const credit = idx.credit >= 0 ? parseMoneyToDecimalString(cell(record, idx.credit)) : null;
      const single = idx.single >= 0 ? parseMoneyToDecimalString(cell(record, idx.single)) : null;
      const currency = (idx.currency >= 0 ? cell(record, idx.currency) : input.defaultCurrency || "CHF")
        .trim()
        .toUpperCase() || "CHF";
      const b1 = cell(record, idx.b1).trim();
      const b2 = cell(record, idx.b2).trim();
      const description = [b1, b2].filter(Boolean).join(" — ") || b1 || "(no description)";

      if (!bookingDate) {
        warnings.push({ code: "invalid_date", message: "Row skipped: unparseable date", rowNumber, field: "bookingDate" });
        continue;
      }
      const hasAmount = Boolean(debit || credit || single);
      if (!hasAmount) {
        warnings.push({ code: "invalid_amount", message: "Row skipped: no Belastung/Gutschrift", rowNumber, field: "amount" });
        continue;
      }

      const amount =
        debit || credit
          ? toDecimal(credit ?? "0").plus(toDecimal(debit ?? "0"))
          : toDecimal(single ?? "0");

      rows.push({
        bookingDate,
        valueDate: idx.value >= 0 ? parseDateToIsoDate(cell(record, idx.value)) : null,
        amount: decimalString(amount),
        currency,
        description,
        counterparty: b1 || null,
        reference: idx.reference >= 0 ? cell(record, idx.reference).trim() || null : null,
        balanceAfter: idx.balance >= 0 ? parseMoneyToDecimalString(cell(record, idx.balance)) : null,
        normalizedMerchantKey: normalizeMerchantKey(b1 || description),
        raw
      });
    }

    return {
      parserKey: ubsAccountCsvParser.key,
      parserVersion: STATEMENT_PARSER_VERSION,
      institution: "ubs",
      accountIdentifier,
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
