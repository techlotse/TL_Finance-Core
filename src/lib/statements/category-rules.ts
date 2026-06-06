import { getCountryProfile } from "@/lib/country-profiles";
import { normalizeHeader } from "./normalize";
import type { NormalizedTransactionRow } from "./types";

const COMBINING_MARKS = /[̀-ͯ]/g;

/** Lower-case + strip diacritics so umlauts (ä→a) match ASCII rule patterns. */
export function flattenText(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKD").replace(COMBINING_MARKS, "").toLowerCase().trim();
}

/** Re-key a raw row map by normalized header so lookups are parser-agnostic. */
export function normalizeRawKeys(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw ?? {})) out[normalizeHeader(k)] = v;
  return out;
}

/**
 * Pick a category NAME for a row from the country profile: bank-provided sector
 * (`Branche`) first, then ordered merchant patterns. Returns null when nothing
 * matches (caller routes it to the review queue). Names only.
 */
export function categorizeRow(
  row: NormalizedTransactionRow,
  options: { profileKey?: string | null } = {}
): string | null {
  const profile = getCountryProfile(options.profileKey);
  const raw = normalizeRawKeys(row.raw ?? {});

  const branche = flattenText(raw.branche ?? raw.sector ?? "");
  if (branche && profile.brancheMap[branche]) {
    return profile.brancheMap[branche];
  }

  const haystack = flattenText(
    [row.description, row.counterparty, raw.beschreibung1, raw.buchungstext]
      .filter(Boolean)
      .join(" ")
  );
  if (!haystack) return null;

  for (const rule of profile.merchantRules) {
    if (rule.patterns.some((p) => p.test(haystack))) {
      return rule.category;
    }
  }
  return null;
}
