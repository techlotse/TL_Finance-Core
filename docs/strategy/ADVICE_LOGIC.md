# Advice logic spec (budget-vs-actual)

This document specifies the Phase 6 advice integration: combining
planned `BudgetLineItem` rows with normalized `ActualTransaction`
rows into variance recommendations, Swiss Bridge liquidity advice,
Pillar 3a contribution-room advice, and the privacy-safe AI payload
shape.

Codex owns implementation of `src/lib/advice/*`; this spec is the
input. The deterministic rules below MUST hold without LLM
involvement — AI is opt-in and only sees aggregates.

## Inputs

- `budgetLineItems` — household's planned items, filtered to
  `deletedAt: null`.
- `actualTransactions` — household's normalized rows for the analysis
  window. Excludes:
  - rows part of a `TransactionTransferMatch` (matched transfers).
  - rows whose `reference` ends with `:fee` (already attributed via the
    main row).
  - rows whose `reviewState = ignored`.
- `categoryRules` — for fallback categorization of `needs_review` rows
  during advice. The matcher runs in-memory; it does NOT mutate row
  state. Reviewed transactions retain their categorization regardless.
- `householdProfile` — country profile + currency + active members.
- `analysisWindow` — `{ from, to }` ISO dates. Default: trailing 90
  days ending today (server-resolved).

## Outputs

```ts
interface AdviceSnapshot {
  generatedAt: string;
  windowFrom: string;
  windowTo: string;
  coverage: AdviceCoverage;
  variancesByCategory: CategoryVariance[];
  recommendations: AdviceRecommendation[];
  swissBridge?: SwissBridgeSnapshot;   // present only when profile == swiss
  pillar3a?: Pillar3aSnapshot;         // present only when profile == swiss
  warnings: AdviceWarning[];
}
```

### `AdviceCoverage`

Quantifies how much of the analysis window has actual data:

```ts
interface AdviceCoverage {
  daysCovered: number;
  daysInWindow: number;
  coverageFraction: string;     // Decimal "0.xxxx"
  accountsWithImports: number;
  accountsTotal: number;
  bookingDateRange: { earliest: string; latest: string };
}
```

`coverageFraction = daysCovered / daysInWindow`, where `daysCovered`
is the count of distinct booking dates with at least one row.

### `CategoryVariance`

```ts
interface CategoryVariance {
  categoryId: string | null;     // null = uncategorized bucket
  categoryName: string;
  groupName: string;
  plannedMonthly: string;        // sum of BudgetLineItems mapped to category
  actualMonthlyAvg: string;      // sum(rows in window) / window months
  varianceMonthly: string;       // actualMonthlyAvg - plannedMonthly
  varianceFraction: string;      // varianceMonthly / plannedMonthly; "0.0000" if planned == 0
  bucket: VarianceBucket;
  confidence: string;            // Decimal "0.xxxx"
  rowCount: number;
}

type VarianceBucket =
  | "under"          // actual < planned * 0.85
  | "on_plan"        // 0.85 <= actual/planned <= 1.15
  | "over"           // 1.15 < actual/planned <= 1.50
  | "far_over"       // actual/planned > 1.50
  | "no_plan";       // plannedMonthly == 0, actual > 0
```

Confidence is derived from coverage and row count:

```
base = coverageFraction
if rowCount < 3: base *= 0.5
if rowCount < 10: base *= 0.75
if categoryId is null: base *= 0.7   // unreviewed bucket is noisier
confidence = max(0.10, min(0.99, base))
```

### `AdviceRecommendation`

```ts
interface AdviceRecommendation {
  id: string;                // stable hash of (categoryId, type, window)
  type: RecommendationType;
  severity: "info" | "warning" | "action";
  titleKey: string;          // i18n key, e.g. "advice.recommendation.over_budget"
  body: string;              // pre-formatted; references actualMonthlyAvg and plannedMonthly via tokens
  categoryId: string | null;
  rationale: string;         // why this fired; cited in UI tooltip
  cite: AdviceCitation[];    // pointers to actual data for transparency
}

type RecommendationType =
  | "over_budget"
  | "consistent_underspend"
  | "no_plan_observed"
  | "pillar_3a_contribution_room"
  | "bridge_liquidity_floor"
  | "tax_provision_drift"
  | "subscription_growth"
  | "fee_drag";
```

A `cite` entry references an aggregate, not raw rows:
`{ kind: "category", categoryId, metric: "actualMonthlyAvg" }`. The UI
expands citations into "view 23 transactions in Groceries" links — the
raw rows live behind the household auth, not in the recommendation
payload.

### `SwissBridgeSnapshot`

```ts
interface SwissBridgeSnapshot {
  liquidAssetsCHF: string;         // sum of liquid-account balances in CHF
  monthlyEssentialSpendCHF: string;
  monthsOfRunway: string;
  floorMonths: string;             // from countryProfile.adviceAssumptions
  status: "below" | "at" | "above";
  recommendation: AdviceRecommendation;
}
```

`monthlyEssentialSpend` = sum of `CategoryVariance.actualMonthlyAvg`
where the category's `groupName` is in
`{ "Housing", "Insurance", "Food and household", "Transport",
  "Childcare and family", "Health" }`.

### `Pillar3aSnapshot`

```ts
interface Pillar3aSnapshot {
  contributedYTD: string;          // sum of confirmed pillar-3a heuristic rows YTD
  maxAnnualCHF: string;            // from countryProfile.adviceAssumptions
  remainingRoom: string;
  monthsRemainingInYear: number;
  suggestedMonthlyContribution: string;
  recommendation: AdviceRecommendation;
}
```

`contributedYTD` uses rows whose `categoryName == "Pillar 3a"` AND
`bookingDate.year == currentYear`. The country profile heuristic
already labels these rows (see
[`TRANSFER_MATCHING.md`](./TRANSFER_MATCHING.md) §Edge cases).

### `AdviceWarning`

Same shape as `StatementWarning` — surfaces "data gap" or
"missing-plan" conditions so the UI can prompt the user to import
more / set a plan, instead of silently generating low-confidence
advice.

| Code                          | Meaning                                                 |
| ----------------------------- | ------------------------------------------------------- |
| `low_coverage`                | `coverageFraction < 0.50` — advice is indicative only.  |
| `no_plan_in_category`         | One or more `no_plan` variances; offer to add to plan.  |
| `account_not_imported`        | A household account has zero rows in the window.        |
| `assumption_stale`            | A country-profile assumption is >12 months old.         |
| `pillar_3a_year_capped`       | `contributedYTD >= maxAnnualCHF`; no further room.      |

## Rule set (deterministic)

These produce `AdviceRecommendation` rows. Each rule is a pure
function of the snapshot inputs.

1. **over_budget**: for each `CategoryVariance` with bucket `over` or
   `far_over` AND confidence >= 0.50.
   - severity = `warning` for `over`, `action` for `far_over`.
   - rationale = `"Spent {actualMonthlyAvg} vs planned {plannedMonthly} over {windowMonths} months"`.
2. **consistent_underspend**: bucket `under` AND
   `rowCount >= 10` AND `confidence >= 0.65`.
   - severity = `info`.
   - rationale = "You consistently spend less than planned; consider
     re-allocating to savings."
3. **no_plan_observed**: bucket `no_plan` AND `rowCount >= 5`.
   - severity = `info`.
4. **fee_drag**: sum of `categoryName == "Bank charges"` rows >
   2% of total inflow in window.
   - severity = `warning`.
5. **subscription_growth**: sum of `Subscriptions` actualMonthlyAvg
   exceeds 1.20× planned AND has grown by >10% over the prior window
   of equal length.
   - severity = `info`.
6. **pillar_3a_contribution_room** (Swiss only):
   - if `contributedYTD < 0.30 * maxAnnualCHF` AND month >= April:
     severity `warning` + body "You're behind your Pillar 3a target
     for this year."
   - if `contributedYTD >= maxAnnualCHF`: severity `info` + body
     "You've reached this year's Pillar 3a cap."
7. **bridge_liquidity_floor** (Swiss only):
   - if `monthsOfRunway < floorMonths`: severity `action` + body
     "Liquid runway is {monthsOfRunway}; Swiss Bridge floor is
     {floorMonths}."
8. **tax_provision_drift**:
   - Swiss: if `Quellensteuer` rows + `Tax prepayment` rows in the
     window < 0.80 × planned: severity `warning` + body referencing
     drift.
   - SA: same check against `Tax prepayment` category.

Codex: implement these as named functions in
`src/lib/advice/rules/*.ts`. Each rule receives the snapshot and
returns 0 or 1 recommendations.

## AI payload shape (privacy-safe)

When the household has AI advice enabled (existing `ai` tier), the
deterministic snapshot is augmented with an LLM call. The payload is
**aggregate-only** — raw transaction descriptions never leave the
process.

```ts
interface AdvicePayload {
  schema: "tlfc.advice.v1";
  locale: string;
  currency: string;
  windowFrom: string;
  windowTo: string;
  variances: Array<{
    categoryName: string;
    groupName: string;
    plannedMonthly: string;
    actualMonthlyAvg: string;
    varianceFraction: string;
    bucket: VarianceBucket;
    confidence: string;
    rowCount: number;
  }>;
  swissBridge?: { monthsOfRunway: string; floorMonths: string };
  pillar3a?: { contributedYTD: string; maxAnnualCHF: string; monthsRemainingInYear: number };
  redactions: {
    rawDescriptionsIncluded: false;
    counterpartyNamesIncluded: false;
    accountIdentifiersIncluded: false;
  };
}
```

The `redactions` object MUST stay `false` on every field. If a future
change wants to include any of those, it requires an explicit opt-in
flag on the household and an admin-visible audit row. Codex: enforce
in `src/lib/advice/ai-payload.ts` via a TypeScript shape that makes it
impossible to set `true` without a feature flag.

## Idempotency and caching

`AdviceSnapshot` is regenerated on every `/advice` page load (Phase 7
integration). Caching is OUT of scope for v1; rules are cheap relative
to a DB roundtrip and the rule set is small.

If volume justifies caching later, key the cache by
`(householdId, windowFrom, windowTo, lastTransactionUpdatedAt,
lastBudgetUpdatedAt, lastRuleUpdatedAt)`.

## Failure modes

- All-zero plan (no `BudgetLineItem`): snapshot is generated with
  every category in `no_plan` bucket. Warnings include
  `no_plan_in_category`. Recommendations still fire for `fee_drag`,
  `pillar_3a_contribution_room`, `bridge_liquidity_floor`.
- Empty actual ledger: snapshot returns warning `low_coverage` and
  empty `variancesByCategory`. Recommendations: none except
  `account_not_imported` warnings.
- Stale country profile assumption: warning `assumption_stale`; rules
  using that assumption still fire but cite the assumption's
  `reviewedOn` date in the body.

## What this spec does NOT include

- Forecast adjustments based on actuals (future Phase 7 work).
- Cross-household benchmarking.
- LLM-generated recommendation text — the LLM augments
  recommendations the deterministic rules emitted; it does not
  invent new ones.
- Automatic plan adjustment (touching `BudgetLineItem` rows). Advice
  is read-only.

## Open questions

1. Window length default — 90 days vs 180 days vs trailing-12-months.
   Initial answer: 90 days for variance accuracy; Pillar 3a and tax
   rules use YTD regardless.
2. Whether `no_plan_observed` should auto-suggest a plan amount.
   Initial answer: yes, suggest the trailing-window
   `actualMonthlyAvg`; the user accepts/edits.
3. Whether SwissBridgeSnapshot should pull from `lib/forecast.ts`
   instead of recomputing essential-spend locally. Initial answer:
   recompute locally so advice is decoupled from forecast state.
