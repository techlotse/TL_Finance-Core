// Country profiles provide deterministic, jurisdiction-aware heuristics for the
// Financial-analysis module: which merchant patterns map to which budget
// category, which rows are internal transfers / FX, and which are savings.
//
// They are intentionally data-only (no IO). The statement classifier composes
// a profile with the household's own categories at import time.

export interface MerchantCategoryRule {
  /** Leaf category name as seeded by the matching onboarding preset. */
  category: string;
  /** Case-insensitive patterns tested against merchant/description text. */
  patterns: RegExp[];
}

export type InternalFlowKind = "transfer" | "fx" | "settlement" | "savings";

export interface InternalSignal {
  kind: InternalFlowKind;
  reason: string;
  patterns: RegExp[];
}

export interface CountryProfile {
  key: string;
  label: string;
  baseCurrency: string;
  /**
   * Ordered merchant → category rules. First match wins, so put specific
   * rules (rent, childcare, insurance) before broad ones (groceries).
   */
  merchantRules: MerchantCategoryRule[];
  /** UBS-card `Branche` (and similar bank-provided sector) → category. */
  brancheMap: Record<string, string>;
  /** Signals that mark a row as internal (excluded from spending). */
  internalSignals: InternalSignal[];
  /** Fallback category for unmatched spend (kept in a review queue). */
  reviewCategory: string;
}
