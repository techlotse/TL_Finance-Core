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

// UBS Mastercard / credit-card CSV export.
// Real shape: a leading `sep=;` line, then a semicolon header:
//   Kontonummer;Kartennummer;Konto-/Karteninhaber;Einkaufsdatum;Buchungstext;
//   Branche;Betrag;Originalwährung;Kurs;Währung;Belastung;Gutschrift;Buchung
// Encoding is Latin-1/CP1252 — decode from raw bytes so umlauts survive.
const DATE_ALIASES = ["einkaufsdatum", "buchungsdatum", "transaktionsdatum"];
const VALUE_ALIASES = ["buchung", "belastungsdatum", "valutadatum"];
const DESC_ALIASES = ["buchungstext", "beschreibung", "text"];
const DEBIT_ALIASES = ["belastung"];
const CREDIT_ALIASES = ["gutschrift"];
const CCY_ALIASES = ["wa_hrung", "wahrung", "belastungswa_hrung", "abrechnungswa_hrung", "currency"];
const HOLDER_ALIASES = ["konto_karteninhaber", "karteninhaber", "kontokarteninhaber"];
const CARD_ALIASES = ["kartennummer", "karte"];

function pick(headers: string[], aliases: string[]): number {
  return headers.findIndex((h) => aliases.includes(h));
}

function decodeLatin1(input: StatementInput): string {
  if (input.bytes && input.bytes.byteLength > 0) {
    return Buffer.from(input.bytes).toString("latin1");
  }
  return input.text ?? "";
}

export const ubsCardCsvParser: StatementParser = {
  key: "ubs-card-csv",
  institution: "ubs",
  detect(input: StatementInput): ParserDetection {
    const text = input.text ?? "";
    if (!text) return { matched: false, confidence: 0, reason: "No text content" };
    const lower = text.toLowerCase();
    const hasDebitCredit = lower.includes("belastung") && lower.includes("gutschrift");
    if (!hasDebitCredit) {
      return { matched: false, confidence: 0, reason: "No Belastung/Gutschrift columns" };
    }
    const ubsCardMarkers =
      lower.includes("kartennummer") || lower.includes("karteninhaber") || lower.includes("einkaufsdatum");
    return {
      matched: true,
      confidence: ubsCardMarkers ? 0.96 : 0.82,
      reason: ubsCardMarkers ? "UBS card CSV header block" : "Card CSV with Belastung/Gutschrift columns"
    };
  },
  async parse(input: StatementInput): Promise<NormalizedStatement> {
    const text = decodeLatin1(input);
    const table = parseDelimitedText(text);
    const headerIndex = table.findIndex((r) =>
      r.some((c) => c.trim().toLowerCase() === "belastung") &&
      r.some((c) => c.trim().toLowerCase() === "gutschrift")
    );
    if (headerIndex < 0) throw statusError("UBS card CSV header row not found", 422);

    const rawHeaders = table[headerIndex].map((h) => h.trim());
    const headers = rawHeaders.map(normalizeHeader);
    const idx = {
      date: pick(headers, DATE_ALIASES),
      value: pick(headers, VALUE_ALIASES),
      desc: pick(headers, DESC_ALIASES),
      branche: headers.indexOf("branche"),
      debit: pick(headers, DEBIT_ALIASES),
      credit: pick(headers, CREDIT_ALIASES),
      currency: pick(headers, CCY_ALIASES),
      holder: pick(headers, HOLDER_ALIASES),
      card: pick(headers, CARD_ALIASES)
    };
    if (idx.date < 0 || (idx.debit < 0 && idx.credit < 0)) {
      throw statusError("UBS card CSV missing date or amount columns", 422);
    }

    const rows: NormalizedTransactionRow[] = [];
    const warnings: StatementWarning[] = [];
    let accountName: string | null = null;
    let accountIdentifier: string | null = null;

    for (let i = headerIndex + 1; i < table.length; i++) {
      const record = table[i];
      const rowNumber = i + 1;
      if (record.every((c) => c.trim() === "")) continue;
      const firstCell = (record[0] ?? "").trim().toLowerCase();
      const descRaw = (cell(record, idx.desc) || "").trim();
      if (firstCell.startsWith("total") || descRaw.toLowerCase().startsWith("total")) continue;

      const raw = rawObject(rawHeaders, record);
      if (!accountName && idx.holder >= 0) accountName = cell(record, idx.holder).trim() || null;
      if (!accountIdentifier && idx.card >= 0) accountIdentifier = cell(record, idx.card).trim() || null;

      const bookingDate = parseDateToIsoDate(cell(record, idx.date));
      const debit = idx.debit >= 0 ? parseMoneyToDecimalString(cell(record, idx.debit)) : null;
      const credit = idx.credit >= 0 ? parseMoneyToDecimalString(cell(record, idx.credit)) : null;
      const currency = (idx.currency >= 0 ? cell(record, idx.currency) : input.defaultCurrency || "CHF")
        .trim()
        .toUpperCase() || "CHF";

      if (!bookingDate) {
        warnings.push({ code: "invalid_date", message: "Row skipped: unparseable date", rowNumber, field: "bookingDate" });
        continue;
      }
      if (!descRaw) {
        warnings.push({ code: "missing_description", message: "Row skipped: empty description", rowNumber, field: "description" });
        continue;
      }
      if (!debit && !credit) {
        warnings.push({ code: "invalid_amount", message: "Row skipped: no Belastung/Gutschrift", rowNumber, field: "amount" });
        continue;
      }

      // Belastung is a positive charge (money out); Gutschrift a credit (money in).
      const amount = toDecimal(credit ?? "0").minus(toDecimal(debit ?? "0"));
      rows.push({
        bookingDate,
        valueDate: idx.value >= 0 ? parseDateToIsoDate(cell(record, idx.value)) : null,
        amount: decimalString(amount),
        currency,
        description: descRaw,
        counterparty: null,
        reference: null,
        balanceAfter: null,
        normalizedMerchantKey: normalizeMerchantKey(descRaw),
        raw
      });
    }

    return {
      parserKey: ubsCardCsvParser.key,
      parserVersion: STATEMENT_PARSER_VERSION,
      institution: "ubs",
      accountName,
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
