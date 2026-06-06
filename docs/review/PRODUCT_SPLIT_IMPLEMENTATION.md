# Product Split + Statement Ingestion — Implementation Notes

Date: 2026-06-04 · Branch: `codex/product-split-foundation`

## What changed

**1. Navigation split (Budgeting / Analysis / Planning).** `src/components/nav.tsx`
now renders grouped sections:

- **Budgeting** — Budget (plan-only; no account required).
- **Analysis** — Analysis (new), Bank Accounts, Transfers, Assets (actuals).
- **Planning · Preview** — Forecast, Investments, Debt, Advice. Marked with a
  "Preview" chip and de-emphasised; each page shows a `PlanningPreviewBanner`
  noting the predictive/simulation tools are parked for future development.
  (`src/components/planning-preview-banner.tsx`.)

**2. Real statement parsers** (registered ahead of the generic fallback in
`src/lib/statements/detect.ts`):

- `parsers/ubs-account-csv.ts` — UBS e-banking current/savings CSV (metadata
  preamble, `Beschreibung1-3`, `Belastung`/`Gutschrift`/`Saldo`). Previously had
  no parser at all.
- `parsers/ubs-card-csv.ts` — UBS Mastercard CSV (`sep=;`, Latin-1 decoded from
  raw bytes, `Einkaufsdatum`/`Buchungstext`, `Branche` as category hint).
- `parsers/revolut-csv.ts` — Revolut per-currency CSV with the real Title-Case
  types (`Card Payment`, `Topup`, `Card Refund`, `Charge`), fee netting, and
  PENDING/REVERTED skipping.

**3. Inter-account transfers & FX** (`src/lib/statements/transfer-match.ts`,
applied in `src/app/api/statement-imports/route.ts`):

- On import, each row is classified. Internal flows — Revolut `Topup`/`Exchange`,
  UBS↔Revolut transfers, credit-card settlements, Pillar 3a and key4 fund moves,
  pocket/round-up — are flagged `reviewState = "ignored"` with a reason in
  `notes`, so they drop out of money-in / money-out.
- A best-effort post-commit pass (`findTransferPairs`) pairs equal-and-opposite
  rows across different accounts within a 4-day window, recording a
  `TransactionTransferMatch` and excluding both legs. This catches own-account
  transfers without needing the account holders' names.
- The Analysis summary converts every currency to the household base (CHF) via
  `convertManyToBase`, so EUR/ZAR spend is comparable and FX legs are excluded.

**4. Deterministic categorization** (`src/lib/statements/category-rules.ts` +
`src/lib/country-profiles/swiss.ts`): merchant/`Branche` rules map to the Swiss
onboarding categories (Rent→Zug Estates, Kita→take best care, Krankenkasse→CSS,
Groceries→Coop/Migros, etc.). Text is diacritic-stripped so umlauts match.
Unmatched spend goes to the review queue (`needs_review`), never silent "Other".
A `generic` profile keeps the universal transfer/FX rules with no Swiss leakage.

**5. Analysis workspace** (`src/app/analysis/`): upload → **preview** (detected
parser, row count, warnings, sample — nothing saved) → **import** (idempotent,
deduplicated). Summary tiles (money in / out / net / internal & FX excluded) and
a transactions table with category and a Spending/Income/Internal flow badge.

No schema migration was required — the existing `20260528120000_statement_ingestion`
migration already provides `StatementImport`, `ActualTransaction` (incl.
`categoryId`, `notes`, `reviewState`), `TransactionCategoryRule`, and
`TransactionTransferMatch`.

Verification: `npm run typecheck` clean, `eslint` clean on new code, `npm test`
green (53 tests, incl. new `src/lib/statements/real-parsers.test.ts`).

## Run it locally (Docker)

`.env` has been completed (added `APP_BASE_URL=http://localhost:3000`).

```bash
cd D:\LocalCode\TL_Finance-Core
docker compose up -d --build
docker compose exec app npx prisma migrate deploy   # creates the tables
docker compose exec app npx prisma db seed          # optional: demo login
```

Open http://localhost:3000.

## How to evaluate

1. Sign up, then complete onboarding and pick the **Swiss** preset — this seeds
   the categories that auto-categorization links to.
2. Go to **Analysis** → import one of your real exports (UBS account CSV, UBS
   card CSV, or a Revolut per-currency CSV). Preview first, then import.
3. Confirm: internal transfers / FX show as **Internal** and are excluded from
   the money-in/out tiles; everyday spend is categorized; re-importing the same
   file adds nothing (dedupe).
4. Check the sidebar groups and that the **Planning** tools (Forecast,
   Investments, Debt, Advice) are present but flagged as Preview.

## Known limits (next steps)

- Cross-account transfer pairing matches only same-currency equal-and-opposite
  legs; link each statement to its Bank Account on import for best results.
- Auto-categorization currently uses the Swiss profile; a South-Africa profile
  (FNB / debit orders / SARS) is stubbed in `country-profiles` for later.
- camt.053 XML and FNB CSV parsers remain to be implemented from real samples.
