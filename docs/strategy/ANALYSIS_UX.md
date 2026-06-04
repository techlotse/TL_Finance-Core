# /analysis UX acceptance criteria (Phase 4)

This document specifies the UX acceptance criteria for the
`/analysis` module Codex implements in Phase 4. Routes already exist
at `/api/statement-imports[/preview]` and `/api/transactions[/[id]]`;
the UI binds to them.

The module owns three pages and two dialogs. All UI follows
`docs/design/UI_SPEC.md` — dark-mode first, Tailwind theme tokens,
Inter, Lucide line icons.

## Module structure

```
src/app/analysis/
  page.tsx                         # Overview: imports list + transaction table
  imports/[id]/page.tsx            # Per-import detail: rows + warnings
  page-header.tsx                  # local subnav
  components/
    upload-card.tsx                # client; multipart upload
    preview-dialog.tsx             # client; preview → confirm/cancel
    transactions-table.tsx         # server-rendered, client filter state
    category-override-dialog.tsx   # client
    transfer-match-prompt.tsx      # client
    warnings-list.tsx              # server
```

The side nav adds an `Analysis` entry between `Forecast` and
`Investments`. The auth/legal/onboarding nav-hide rules in
`nav.tsx` already cover all redirects.

## Page 1 — `/analysis` (Overview)

### Layout

```
+----------------------------------+
| PageHeader: "Analysis"           |
| Subtitle: "Statements & actuals" |
+----------------------------------+
| UploadCard                       |
+----------------------------------+
| RecentImports (last 10)          |
+----------------------------------+
| Transactions (default: last 90d) |
| Filters: dateRange | categoryId  |
|          | accountId | text      |
|          | excludeTransfers      |
| Table: 25 rows, cursor paginated |
+----------------------------------+
```

### UploadCard requirements

- Drop zone + file input. Accepts `.xml`, `.csv`, `.xlsx`. Rejects
  files > `MAX_STATEMENT_IMPORT_BYTES` (5 MB) client-side AND server
  enforces.
- Optional account selector populated from
  `GET /api/accounts` filtered to non-credit accounts. If selected,
  the import is bound to that account and currency-pocket mapping is
  validated (server already enforces).
- Optional `defaultCurrency` field shown only when the user opts in
  via "Advanced" disclosure — generic CSV parsing needs it when no
  currency column exists.
- On submit:
  1. `POST /api/statement-imports/preview` (multipart).
  2. Open `PreviewDialog` with the response.
  3. User clicks "Cancel" → discard.
  4. User clicks "Commit" → `POST /api/statement-imports` with the
     same `file`, `accountId`, `defaultCurrency`. Re-uploading the
     same file is idempotent via `contentHash` unique constraint.

### PreviewDialog requirements

Shows BEFORE any commit:

- Detected parser key + institution + confidence.
- Row count (would-import) and warning count.
- Top-level warnings list (`balance_mismatch`, `fee_split`,
  `multi_account_file`) — these are NOT row-level and must be
  surfaced prominently.
- A scrollable preview table with the first 50 rows (server already
  returns `sampleRows`). Columns: booking date, description,
  counterparty, amount, currency.
- If `warningCount > 0`, the Commit button shows a confirmation
  step ("X warnings — review before committing").
- If `parserKey === "generic-csv"`, banner: "Detected as generic
  CSV. Match confidence is lower — review carefully."
- A11y: dialog traps focus, Esc cancels, Enter commits when warnings
  acknowledged.

### RecentImports section

Server-rendered card list. Each card:

- Filename + parserKey + institution badge.
- Status pill: `previewed` / `committed` / `failed`.
- Counts: rowCount, importedCount, duplicateCount, warningCount.
- Link to `/analysis/imports/[id]` for the detail view.
- Created timestamp (relative).

### Transactions table requirements

- Server-rendered initial rows (first page), client-side filter UI.
- Columns: bookingDate, description, counterparty, categoryName,
  amount, currency, accountName, reviewState badge.
- Cursor pagination by `(bookingDate desc, id desc)`. Page size 25.
- Filters call `GET /api/transactions?...` (Codex will add this in
  Phase 4 — the route exists). Filters are URL-state, so links can
  be shared within the household.
- Each row clickable → opens a side-panel with full detail + actions
  ("Change category", "Mark as transfer", "Hide from analysis").
- `excludeTransfers` filter strips matched-pair rows from the result;
  default `true` for the overview.
- Rows with `reviewState = needs_review` show a "Review" badge and a
  "Confirm/override" action.

## Page 2 — `/analysis/imports/[id]`

Detail view for a single import.

- Header: filename, parserKey, institution, status, counts.
- Warnings list (all of them, not just the first 50).
- Imported rows table — same columns as the overview transactions
  table, but scoped to `importId == id`.
- Action button: "Reprocess" — admin-only; re-runs the parser on
  the stored bytes (if the import was committed within the last 7
  days). Out of scope for v1; the button is hidden but the
  contract is preserved.
- Action button: "Delete import" — soft-deletes the import AND all
  its rows. Requires confirmation dialog. Writes audit row
  `statement_import_delete`.

## Page 3 — review queue (collapses into the overview filter)

There is no dedicated `/analysis/review` route in v1. The review
queue is the overview transaction table with filter
`?reviewState=needs_review`. The side nav surfaces a count badge
when `count > 0`.

## CategoryOverrideDialog

Triggered from the row side-panel or the review queue.

- Searchable category dropdown (existing `Select` primitive from
  `src/components/ui/`).
- Optional "Create rule from this row" checkbox; on save, also calls
  `POST /api/transaction-category-rules` (Codex adds this route in
  Phase 4) to persist a household-scoped rule with `matchType =
  contains`, pattern = normalized merchant key.
- On save: `PATCH /api/transactions/[id]` with new
  `{ categoryId, reviewState: "confirmed" }` body, then refetch the
  page.

## TransferMatchPrompt

Shown inline above the row pair when a `TransactionTransferMatch`
with confidence in `[0.60, 0.75)` is detected.

- "We think these two rows are an internal transfer. Confirm?"
- Inline preview of both rows.
- Confirm button → `PATCH /api/transfer-matches/[id]` (Codex adds in
  Phase 4) with `{ confirmed: true }`.
- Reject button → `DELETE /api/transfer-matches/[id]`; rows return to
  spending. Notes are updated to prevent re-pairing.

## Empty states

- No imports yet: show only the UploadCard with an inline copy block:
  "Upload a statement to begin. UBS camt.053 XML, Revolut CSV, and
  FNB CSV are supported."
- Account-less import landing zone: the overview still works without
  an account selected; explain that rows won't show an account name
  until the user assigns them or re-imports with an account
  selected.

## Failure states

- Parser errored on commit: show inline error + last preview state
  intact for retry.
- Idempotent duplicate (re-upload of same file): show banner
  "Already imported (X rows, Y duplicates skipped)" and link to the
  existing import.
- `multi_account_file` warning on commit: blocked commit; banner
  asks user to upload one account at a time.

## Performance acceptance

- Transactions list query MUST be O(page size) — uses the
  `(householdId, bookingDate)` index. No N+1 on category /
  account fetches.
- The overview page server render budget: 800 ms p95 with 50k rows
  for the household.
- The preview-dialog opens before all rows are decoded; server
  returns `sampleRows` (first 50) instead of all parsed rows.

## A11y acceptance

- Color is not the only signal — `reviewState`, transfer badges, and
  status pills include text labels.
- Tables are keyboard-traversable; cell focus visible.
- Dialogs trap focus, restore focus on close, announce open via
  `role="dialog"` + `aria-labelledby`.

## Audit acceptance

Every state-changing UI action calls an existing API route that
writes audit. The UI never short-circuits that. New audit actions
introduced by this module:

| Action                          | resourceType         |
| ------------------------------- | -------------------- |
| `statement_import_preview`      | `statement_import`   |
| `statement_import_commit`       | `statement_import`   |
| `statement_import_delete`       | `statement_import`   |
| `transaction_category_override` | `actual_transaction` |
| `transfer_match_confirm`        | `transfer_match`     |
| `transfer_match_reject`         | `transfer_match`     |

The first three already write (see the route handler). The remaining
three are Codex Phase 4 additions — the spec captures the expected
action names so the audit table stays consistent.

## Open questions

1. Whether the transactions table should surface `raw` payload data
   on click. Initial answer: yes, behind a collapsible "Source
   row" disclosure for transparency. Hide by default.
2. Whether the UX should expose a re-categorize-all action after
   adding a rule. Initial answer: yes, but as a one-shot button on
   the new rule form, not a global cron. Calls a dedicated
   `POST /api/transaction-category-rules/[id]/apply` route.
3. Whether bulk operations are in scope (multi-row select + assign
   category). Initial answer: NO for v1 — single-row only. Bulk
   ops are a v1.1 punch-list item.
