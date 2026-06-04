export const STATEMENT_PARSER_VERSION = "0.1.0";

export const STATEMENT_INSTITUTIONS = [
  "ubs",
  "revolut",
  "fnb",
  "standardbank",
  "investec",
  "generic",
  "unknown"
] as const;

export type StatementInstitution = (typeof STATEMENT_INSTITUTIONS)[number];

export interface StatementWarning {
  code: string;
  message: string;
  rowNumber?: number;
  field?: string;
}

export interface StatementInput {
  fileName?: string | null;
  mimeType?: string | null;
  text?: string | null;
  bytes?: Uint8Array | null;
  contentHash: string;
  defaultCurrency?: string | null;
}

export interface ParserDetection {
  matched: boolean;
  confidence: number;
  reason: string;
  warnings?: StatementWarning[];
}

export interface NormalizedTransactionRow {
  bookingDate: string;
  valueDate?: string | null;
  amount: string;
  currency: string;
  description: string;
  counterparty?: string | null;
  reference?: string | null;
  balanceAfter?: string | null;
  normalizedMerchantKey?: string | null;
  raw: Record<string, string>;
}

export interface NormalizedStatement {
  parserKey: string;
  parserVersion: string;
  institution: StatementInstitution;
  accountName?: string | null;
  accountIdentifier?: string | null;
  rows: NormalizedTransactionRow[];
  warnings: StatementWarning[];
}

export interface StatementParser {
  key: string;
  institution: StatementInstitution;
  detect(input: StatementInput): ParserDetection;
  parse(input: StatementInput): Promise<NormalizedStatement>;
}
