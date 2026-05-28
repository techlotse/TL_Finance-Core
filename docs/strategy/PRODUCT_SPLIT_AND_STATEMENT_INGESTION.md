# TL Finance Core - Product Split and Statement Ingestion

## Purpose

This document records the first-pass plan for splitting TL Finance Core into
three usable portions while adding bank-statement analysis:

| Portion | User promise | Account dependency |
| --- | --- | --- |
| Budgeting | Plan income, expenses, savings, and categories without setting up bank accounts | None |
| Financial analysis | Upload bank statements, normalize transactions, track money in, out, and across accounts | Required only as statement containers |
| Advice | Compare planned budget against actual spending and optimize the plan | Uses both when available |

The current checkout is v0.7.9. It already has auth, households, categories,
budget line items, bank accounts, transfers, assets, debt, forecast, Smart
advice, Swiss Bridge advice, AI advice, payments alpha configuration, and HA
deployment docs. It does not yet have a transaction ledger, statement-upload
pipeline, parser registry, actual-vs-budget variance model, or analysis
workspace.

Current repository picture:

| Area | Current state |
| --- | --- |
| Version | `package.json`, `README.md`, and public docs identify the checkout as v0.7.9 |
| Working tree before this plan | Clean `main` tracking `origin/main` |
| Product tiers | `core`, `smart`, and `ai` exist, but they are pricing/access tiers rather than the proposed module split |
| Budgeting | Budget items can already exist without an account because `BudgetLineItem.accountId` is nullable |
| Accounts | Bank accounts and currency pockets exist for forecasts, debt, investments, transfers, and balance snapshots |
| Advice | Smart, Swiss Bridge, and AI advice exist and currently operate on planned budget/account data |
| Analysis gap | No `Transaction`, `StatementImport`, parser, merchant rule, transfer-match, or actual-vs-budget model exists |
| Tests | Unit tests and access integration tests exist; new statement work needs parser, import, access, and performance tests |

## Architecture

Keep this as one Next.js application and one PostgreSQL schema. The split should
be a product and navigation split first, not three services. Shared tenant,
auth, categories, money, FX, audit, and admin configuration remain central.

Target module boundaries:

| Module | Routes | Owns | Must not own |
| --- | --- | --- | --- |
| Budgeting | `/budget`, budget settings under `/settings` | `IncomeEarner`, `CategoryGroup`, `Category`, `BudgetLineItem` | Actual bank transactions |
| Financial analysis | `/analysis`, `/api/statement-imports`, `/api/transactions` | Statement imports, normalized actual transactions, merchant/category rules, transfer matching | Planned recurring budget rows |
| Advice | `/advice`, `/api/advice/*` | Snapshot aggregation, budget-vs-actual variance, recommendations, AI payload shaping | Raw statement file parsing |

The existing `BudgetLineItem.accountId` is already nullable, so pure budgeting
can be implemented without a schema rewrite. The main UI change is to stop
presenting accounts as part of the required budget setup path.

Recommended new database models:

| Model | Purpose |
| --- | --- |
| `StatementImport` | One uploaded file or structured statement run with status, parser key, content hash, detected institution, account link, row counts, warnings, and audit metadata |
| `ActualTransaction` | Normalized ledger row: household, optional bank account/currency pocket, import id, institution, booking date, value date, amount, currency, description, counterparty, reference ids, balance after, raw JSON, category id, review state, and dedupe hash |
| `TransactionCategoryRule` | Deterministic merchant/description rules scoped to household and optionally country profile |
| `TransactionTransferMatch` | Links actual debit/credit rows that are internal transfers or FX exchanges so analysis excludes them from spending |

Additive migration only. Use `Decimal @db.Decimal(18, 4)` for amounts and
store money as strings over JSON. Add indexes on:

- `ActualTransaction(householdId, bookingDate)`
- `ActualTransaction(householdId, categoryId, bookingDate)`
- `ActualTransaction(householdId, normalizedMerchantKey)`
- `ActualTransaction(importId)`
- unique `ActualTransaction(householdId, dedupeHash)`
- unique `StatementImport(householdId, contentHash)`

Parser layout:

```text
src/lib/statements/
  types.ts
  detect.ts
  normalize.ts
  dedupe.ts
  category-rules.ts
  transfer-match.ts
  parsers/
    ubs-camt053.ts
    ubs-card-csv.ts
    revolut-csv.ts
    revolut-xlsx.ts
    fnb-csv.ts
    generic-csv.ts
```

Parser contract:

```ts
interface StatementParser {
  key: string;
  institution: StatementInstitution;
  detect(input: StatementInput): ParserDetection;
  parse(input: StatementInput): Promise<NormalizedStatement>;
}
```

Every parser must return normalized rows plus warnings and confidence. It must
fail closed when dates, signs, currency, or account identity cannot be inferred.
No parser should silently drop rows.

Bank priority:

| Priority | Institution | First target | Notes |
| --- | --- | --- | --- |
| P1 | UBS | ISO 20022 `camt.053` XML, then UBS card CSV | UBS documents camt.052, camt.053, and camt.054 account reports and camt self-service in E-Banking: [UBS account reports](https://www.ubs.com/ch/en/services/payments/cash-management/account-reporting.html). |
| P1 | Revolut | Excel/CSV export per currency | Revolut states that currency statements include pending/completed/reverted transactions and can be generated as PDF or Excel: [Revolut statement help](https://help.revolut.com/help/profile-and-plan/managing-my-account/account-statement-per-chosen-currency/). |
| P2 | FNB | Official CSV export | FNB publishes a CSV statement file specification for Online Banking imports: [FNB CSV specification](https://www.online.fnb.co.za/rhelp_0_15/Downloads/Statement_File_Specifications/Statement_Type_-_CSV.pdf). |
| P3 | Standard Bank | Structured export where available, PDF later | Standard Bank personal FAQ confirms download/view flows; Business Online states statements are downloadable in multiple ERP/accounting-compatible formats: [FAQ](https://www.standardbank.co.za/southafrica/personal/contact-us/frequently-asked-questions), [Business Online](https://www.businessonline.standardbank.co.za/bol/balances-and-statements.html). |
| P4 | Investec | PDF or CSV only after real samples | Public Investec private-banking help emphasizes online statements and PDF availability, so treat structured import as sample-driven: [Investec statements](https://www.investec.com/en_gb/help/individuals/private-banking/manage-my-account/statements.html). |

PDF/OCR should not be the first implementation path for accuracy. Accept PDFs
only after structured UBS, Revolut, and FNB paths are stable, and put all PDF
rows through a review queue with explicit confidence warnings.

## Configuration

First-pass accuracy rules:

1. Build from sanitized real fixtures, not assumed bank formats.
2. Require at least two sanitized samples per supported bank/format before
   marking a parser production-ready.
3. Store original row JSON and parser version on every imported row.
4. Make imports idempotent by file hash and row dedupe hash.
5. Show parser warnings before commit; let the user cancel.
6. Default unknown categories to a review queue, not "Other" without review.
7. Detect internal transfers and FX exchanges before spending summaries.
8. Keep AI out of parsing. AI may advise from aggregates after deterministic
   import and categorization have succeeded.
9. Never send raw transaction descriptions to AI by default; aggregate or
   redact merchant-level context first.
10. Preserve household scoping and audit logging on every import, category
    override, rule edit, and transaction delete/hide action.

Performance rules:

1. Limit upload size in the route handler and reject oversized files early.
2. Parse in a Node runtime route, not Edge middleware.
3. Use streaming or bounded parsers for CSV/XML where practical.
4. Write transactions with `createMany({ skipDuplicates: true })` in batches.
5. Avoid per-row Prisma writes inside parser loops.
6. Paginate transaction lists by date/id cursor.
7. Compute dashboard aggregates with grouped database queries or bounded
   materialized summaries once data volume grows.
8. Add tests for 1k, 10k, and 50k row parser/import paths before calling the
   analysis module ready.

Swiss-first but country-adaptable design:

```text
src/lib/country-profiles/
  types.ts
  swiss.ts
  generic.ts
  south-africa.ts
```

Country profiles should provide default merchant keywords, tax/retirement
signals, transfer heuristics, and advice assumptions. Swiss profile owns
Pillar 3a, Quellensteuer, Krankenkasse, Nebenkosten, SBB, Coop/Migros, and
Swiss Bridge assumptions. South Africa profile can later own SARS/tax,
medical-aid, debit-order, bond, and local bank-specific merchant patterns.

## Deployment

Implement in phases that can ship independently:

| Phase | Owner bias | Scope | Exit criteria |
| --- | --- | --- | --- |
| 0 | Codex | Add this plan, align agent instructions, create implementation checklist | Done on branch `codex/product-split-foundation` |
| 1 | Codex | Module boundary cleanup: nav grouping, pure-budget path, no account requirement in budget UX | Budget schema already permits zero-account planning; full UI grouping remains a follow-up |
| 2 | Codex | Add statement schema, migration, Zod schemas, API route skeletons, parser interface, tests | Branch `codex/product-split-foundation` adds the mergeable foundation |
| 3 | Claude + Codex | UBS/Revolut parser specs and fixtures, then deterministic parser implementation | Golden fixture tests pass; import preview shows exact row counts and totals |
| 4 | Codex | Import commit pipeline, transaction table, category review, transfer matching | Idempotent imports; 10k-row path stays responsive |
| 5 | Claude + Codex | FNB parser and South Africa profile foundations | FNB fixtures pass; no Swiss assumptions leak into generic analysis |
| 6 | Claude | Advice logic spec for budget-vs-actual optimization and privacy-safe AI payloads | Recommendations cite actual variance and confidence |
| 7 | Codex | Integrate actuals into Smart/AI advice, docs, readiness checks | `typecheck`, `lint`, unit tests, access tests, and build pass |
| 8 | Claude + Codex | Standard Bank and Investec sample-driven support | Structured formats first; PDF paths require review workflow |

Do not split services before v1 of this feature. The performance bottleneck is
more likely parser/import/query shape than Next.js process boundaries.

Implementation checklist:

1. Confirm sanitized UBS and Revolut samples and lock parser acceptance
   fixtures.
2. Add schema/migration for imports, actual transactions, rules, and transfer
   matches.
3. Add parser interface and a generic import preview route with no commit path.
4. Implement UBS `camt.053` and Revolut structured parser fixtures.
5. Add commit route using idempotent batch writes and audit events.
6. Build `/analysis` import, review, and transaction table screens.
7. Add categorization and internal-transfer matching with review states.
8. Add actual-vs-budget aggregates and Advice snapshot integration.
9. Add FNB CSV parser and South Africa profile.
10. Revisit Standard Bank and Investec after real samples identify the safest
    structured or PDF path.

## Usage

Codex implementation instructions:

- Own schema, migrations, API route handlers, Prisma query performance,
  ownership checks, audit events, route guards, and CI checks.
- Create parser interfaces and enforce strict normalized output types.
- Implement deterministic parsers only after fixtures exist.
- Keep edits scoped and additive; do not delete or rename existing models until
  compatibility has been proven.
- Add unit tests for parser normalization, dedupe, categorization, transfer
  matching, and advice aggregation.
- Add DB-backed access tests for cross-household statement imports and
  transaction mutations.
- Update `docs/architecture/DATA_MODEL.md`, `docs/reference/API.md`,
  `docs/reference/DATABASE_SCHEMA.md`, and `docs/product/USER_GUIDE.md` in the
  same change as implementation.

Claude Opus 4.7 implementation instructions:

- Start after `codex/product-split-foundation` is merged or checked out.
- Treat `src/lib/statements/types.ts` as the parser contract and
  `src/lib/statements/parsers/generic-csv.ts` as the low-confidence fallback,
  not as a bank-specific implementation.
- Do not redesign the statement schema or API routes in the first Claude pass;
  produce fixture/spec changes that Codex can implement against.
- Own long-context domain analysis, bank-format notes, fixture annotation,
  categorization heuristics, country-profile assumptions, UX acceptance
  criteria, and advice recommendation logic.
- Review sanitized bank samples and produce exact parser expectations: row
  count, opening/closing balances, date interpretation, sign convention,
  fees, reversals, pending rows, card transactions, FX rows, and transfer
  candidates.
- Draft golden test cases before Codex implements each parser.
- Keep recommendations jurisdiction-aware but not regulated financial advice.
- For Swiss-first advice, explicitly model Pillar 3a, Swiss Bridge liquidity,
  Quellensteuer/tax buckets, health insurance, rent/Nebenkosten, and public
  transport patterns.
- For South Africa, keep FNB/Standard/Investec support in a separate country
  profile so Swiss assumptions do not leak.
- Challenge parser confidence and privacy assumptions before AI integration.

Joint handoff protocol:

1. Claude writes or reviews parser/spec fixtures first.
2. Codex implements or adjusts code to satisfy the fixture contract.
3. Codex runs tests and reports failures with exact fixture row references.
4. Claude reviews misclassifications and updates deterministic rules.
5. Codex integrates the rule changes and reruns the full relevant checks.

## Troubleshooting

- If a bank export format is unclear, block that parser behind "preview only"
  and request a sanitized sample rather than guessing.
- If a transaction can be either spending or transfer, mark it for review and
  exclude it from advice until confirmed.
- If row totals do not reconcile to statement balances, do not commit the import
  without a warning and explicit user confirmation.
- If analysis queries slow down, inspect indexes and aggregate shape before
  adding caching infrastructure.
- If a route touches `ActualTransaction`, it must use the same household
  scoping and audit discipline as existing account and budget routes.
