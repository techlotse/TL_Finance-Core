# Country profile module spec

This document specifies the contract Codex implements at
`src/lib/country-profiles/`. Country profiles encapsulate
locale-specific assumptions for transaction categorization, internal
transfer detection, tax/retirement signals, and advice heuristics, so
that Swiss-first features do not leak into non-Swiss analysis.

Per the strategy doc (`PRODUCT_SPLIT_AND_STATEMENT_INGESTION.md`), the
target file layout is:

```
src/lib/country-profiles/
  types.ts
  swiss.ts
  generic.ts
  south-africa.ts
```

Country profiles are **read-only data + pure functions** — no DB
access, no network. They're imported by:

- `src/lib/statements/category-rules.ts` (Phase 4) to seed
  `TransactionCategoryRule` rows per household at onboarding.
- `src/lib/statements/transfer-match.ts` (Phase 4) for transfer
  heuristics that benefit from local context (e.g. "Pillar 3a
  contribution" looks like an outflow but is a savings transfer).
- `src/lib/advice/*` (Phase 6) for jurisdiction-aware budget
  recommendations.

The profile is selected per household via a new
`Household.countryProfile` column (additive migration; Codex Phase 5).
Default: `generic`. Swiss preset auto-selects `swiss`. SA users pick
during onboarding.

## Relationship to existing category presets

`src/lib/category-presets.ts` already ships Swiss / Generic /
(stubbed) German / French presets — those are **category structures**
(group names + category names). Country profiles are **rules and
heuristics** layered on top of those structures. The two coordinate
via category names: a country profile rule names the category it maps
to using the same string the preset uses ("Groceries", "Health
insurance basic", etc.).

Per-language category name variants are out of scope for v1. Swiss
profile uses English category names (matches the existing Swiss
preset).

## `types.ts`

```ts
import type { StatementInstitution } from "@/lib/statements/types";

export const COUNTRY_PROFILE_CODES = [
  "swiss",
  "south-africa",
  "generic"
] as const;
export type CountryProfileCode = (typeof COUNTRY_PROFILE_CODES)[number];

/**
 * A merchant/description rule that maps a transaction to a category.
 * Mirrors the TransactionCategoryRule DB shape but without householdId
 * (profiles are scoped per locale, then materialized per household at
 * onboarding).
 */
export interface CategoryRuleSeed {
  /** Category preset name this rule targets ("Groceries", "Rent", …). */
  categoryName: string;
  /** Group name in the preset, used for disambiguating duplicates. */
  groupName: string;
  /** Match strategy. */
  matchType: "contains" | "exact" | "starts_with";
  /** Pattern, case-insensitive, matched against the row's
   *  normalizedMerchantKey first, then description, then counterparty.
   *  Must be lowercase. */
  pattern: string;
  /** Priority — higher wins on ties; ties resolved by pattern length
   *  (longer = more specific) then by alphabetical pattern. */
  priority: number;
  /** Optional restriction by source institution. */
  institutionScope?: StatementInstitution[];
  /** Optional rationale documenting why the rule exists. */
  rationale?: string;
}

export type TransferDetectionSignal =
  | { kind: "pillar-3a"; provider: string }
  | { kind: "savings-vault"; vaultName: string }
  | { kind: "internal-account-pair"; reason: string }
  | { kind: "tax-prepayment"; jurisdiction: string };

export interface TransferDetectionHeuristic {
  /** Pattern matched (lowercase, against description+counterparty). */
  pattern: string;
  /** What the matched transaction represents. */
  signal: TransferDetectionSignal;
  /** Score added to transfer-match confidence (0..1 range). */
  confidenceBoost: number;
}

export interface AdviceAssumption {
  key: string;
  /** Human-readable description for the advice rationale text. */
  description: string;
  /** Numeric value in account currency (or fraction, e.g. 0.072 for
   *  7.2%). Currency interpreted by the consumer. */
  value: string;
  /** ISO date when the assumption was last reviewed. Old assumptions
   *  trigger a freshness warning in the admin observability view. */
  reviewedOn: string;
  /** Source citation, e.g. URL or document name. */
  source: string;
}

export interface CountryProfile {
  code: CountryProfileCode;
  displayName: string;
  defaultCurrency: string;
  /** Locales where this profile is the recommended pick during onboarding. */
  locales: string[];
  /** Category rule seeds, merged with generic-profile seeds at
   *  household onboarding (locale-specific wins on tie). */
  categoryRules: CategoryRuleSeed[];
  /** Transfer-match heuristics specific to this locale. */
  transferHeuristics: TransferDetectionHeuristic[];
  /** Advice assumptions surfaced by Phase 6 advice logic. */
  adviceAssumptions: AdviceAssumption[];
}

/** Lookup helper. */
export function getCountryProfile(code: CountryProfileCode): CountryProfile;

/** Merge generic rules into a locale profile so consumers only need
 *  to call one function. Locale rules win on duplicate (categoryName,
 *  pattern) pairs. */
export function effectiveCategoryRules(
  code: CountryProfileCode
): CategoryRuleSeed[];
```

## `generic.ts`

The fallback. Contains universal merchant patterns that apply across
locales: airline ticketing terms, common platform names, common bank
fee descriptors.

Examples (full list is in
[`CATEGORIZATION_RULES.md`](./CATEGORIZATION_RULES.md)):

- Pattern `"netflix"` → `Subscriptions` / `Streaming`.
- Pattern `"spotify"` → `Subscriptions` / `Streaming`.
- Pattern `"apple.com/bill"` → `Subscriptions` / `Apple services`.
- Pattern `"airbnb"` → `Travel` / `Lodging`.
- Pattern `"interest"` (description contains) → `Income` / `Interest`.

Generic profile has NO transferHeuristics and NO adviceAssumptions in
v1 — those exist only to be locale-aware.

## `swiss.ts`

Swiss-specific:

- Merchants: Coop, Migros, Denner, Aldi Suisse, Lidl Schweiz, Manor,
  SBB CFF FFS, ZVV, BVB, BLS, Sunrise, Salt, Swisscom, Helsana, CSS,
  Sanitas, Concordia, Visana, AXA, Zurich, Mobiliar, VIAC, Frankly,
  TrueWealth, Selma, PostFinance.
- Tax / retirement keywords: `quellensteuer`, `steuerverwaltung`,
  `steueramt`, `staatssteuer`, `bundessteuer`, `kantonssteuer`,
  `gemeindesteuer`, `kapitalsteuer`, `vermoegenssteuer`,
  `saeule 3a`, `säule 3a`, `pillar 3a`, `pillar 3b`, `BVG`, `AHV`,
  `IV`, `EO`.
- Housing keywords: `nebenkosten`, `mietzins`, `miete`,
  `hausverwaltung`, `liegenschaftsverwaltung`.
- Public transport: `SBB`, `CFF`, `FFS`, `ZVV`, `BVB`, `BLS`, `MOBIS`.
- Internal transfer heuristics:
  - `pattern: "saeule 3a"` → `pillar-3a`, confidence +0.30.
  - `pattern: "pillar 3a"` → `pillar-3a`, confidence +0.30.
  - `pattern: "viac"` → `pillar-3a`, confidence +0.20 (provider).
  - `pattern: "frankly"` → `pillar-3a`, confidence +0.20.
- Advice assumptions (initial values, all `reviewedOn: 2026-05-29`):
  - `pillar3a.maxEmployedContribution`: `"7258.0000"` CHF/yr (2026
    employed cap; verify before production). Source: SR 831.40 BVV3
    Art. 7.
  - `pillar3a.maxSelfEmployedContributionFraction`: `"0.2000"` (20%
    of self-employed income, capped). Source: BVV3 Art. 7.
  - `bridge.liquidityFloorMonths`: `"6.0000"` months. Source:
    internal Swiss Bridge advice spec.
  - `quellensteuer.applicabilityThresholdMonthlyCHF`: `"120000.0000"`
    annualised threshold for Nachträgliche ordentliche Veranlagung
    (NOV). Source: Kreisschreiben 45.
  - `healthInsurance.basicMonthlyMedianCHF`: indicative, NOT advice —
    used for sanity-checking budgeted Krankenkasse line items only.

## `south-africa.ts`

South Africa specifics — does not load when the household profile is
not `south-africa`.

- Merchants: Pick n Pay, PnP, Checkers, Shoprite, Woolworths, SPAR,
  Engen, Sasol, BP, Caltex, Total, MTN, Vodacom, Cell C, Telkom,
  Eskom, Discovery Health, Momentum Health, Bonitas, Liberty,
  Sanlam, Old Mutual, Outsurance, MiWay, Standard Bank, FNB, ABSA,
  Nedbank, Capitec, Investec, SARS, City of Joburg, City of Cape Town,
  eThekwini.
- Tax / retirement keywords: `SARS`, `IT12`, `IT34`, `IRP5`, `PAYE`,
  `UIF`, `provident fund`, `pension fund`, `retirement annuity`, `RA`.
- Medical aid keywords: `Discovery Health`, `Momentum Health`,
  `Bonitas`, `Fedhealth`, `Bestmed`, `Profmed`, `medical aid`.
- Public transport: rare in personal banking — Gautrain, Uber Cape
  Town.
- Internal transfer heuristics:
  - `pattern: "transfer to savings"` → `internal-account-pair`,
    confidence +0.25 (boost only — final pairing still needs an
    account match).
  - `pattern: "transfer to retirement"` → savings-vault variant.
  - `pattern: "ra contribution"` → tax-prepayment, confidence +0.20.
- Advice assumptions (`reviewedOn: 2026-05-29`):
  - `ra.maxContributionFraction`: `"0.2750"` (27.5% of taxable
    income, capped at R350k). Source: SARS retirement reform 2016+.
  - `ra.maxAnnualCapZAR`: `"350000.0000"`.
  - `medicalAid.tax_credit.principalMonthly`: `"364.0000"` (2026
    primary member medical scheme fees tax credit, ZAR/mo — verify
    against current SARS Budget speech).
  - `bridge.liquidityFloorMonths`: `"3.0000"` months (SA professional
    practice; lower than Swiss because of lower asset-cover norms).
  - `vat.standardRate`: `"0.1500"`.

## Effective rule merging

`effectiveCategoryRules(code)` returns the union of:

1. `getCountryProfile("generic").categoryRules` (always included).
2. `getCountryProfile(code).categoryRules` (when code != generic).

If a pattern appears in both, the locale's rule replaces generic
(same `pattern`, same `matchType`, same lower-cased text). Ties on
priority are broken by:

1. Locale wins over generic.
2. Longer pattern wins (more specific).
3. Alphabetical pattern.

Codex: this ordering must match the runtime selection in
`category-rules.ts` so onboarding seeding and runtime matching agree.

## Onboarding seeding

When the onboarding wizard runs with `applyPreset({ countryProfile })`,
the household receives:

1. A row for each preset category (existing behavior).
2. One `TransactionCategoryRule` per `CategoryRuleSeed` in
   `effectiveCategoryRules(code)`, mapped to the matching
   `Category.id` for that household. Patterns whose `categoryName` is
   not present in the household's categories are silently skipped (a
   warning is logged but no audit row is written — these come from
   profile drift and are expected).

## Profile freshness

`AdviceAssumption.reviewedOn` older than 12 months should surface in
the admin observability page (Phase 6 punch-list). The freshness
check is a pure function over the profile; no DB schema change
required.

## What profiles do NOT own

- The set of categories (`category-presets.ts` owns that).
- Forecast / debt / investment math.
- AI prompt shape (`advice/ai-payload.ts`, Phase 6).
- The countryProfile column itself — Codex Phase 5 migration adds
  `Household.countryProfile`.

## Open questions

1. Whether to ship one profile or many per locale (e.g. distinct CH-DE
   / CH-FR / CH-IT profiles). Initial answer: one Swiss profile;
   language-tuned merchant patterns can stack via generic.
2. Whether `effectiveCategoryRules` should be memoized per code at
   import time. Initial answer: yes — profiles are static at runtime.
3. Whether `transferHeuristics.pattern` should be a regex or literal
   substring. Initial answer: literal substring matched after
   `normalizeText`. Regex adds complexity for marginal benefit at
   this stage.
