# Transfer-matching heuristic spec

This document specifies `src/lib/statements/transfer-match.ts` (Phase
4, Codex-owned implementation). The model
`TransactionTransferMatch` is already in the migration
(`20260528120000_statement_ingestion`), with FKs on
`debitTransactionId` and `creditTransactionId`, a unique constraint
on the household + pair, and a `confidence Decimal(8,6)` column.

Purpose: identify the same-money-moving-between-two-rows patterns and
exclude those from spending aggregates and advice. Examples:

- Same-currency internal transfer between two of the household's
  accounts (e.g. UBS current → UBS savings).
- FX exchange between two Revolut wallets (EUR debit, CHF credit).
- Pillar 3a contribution from a current account to a VIAC/Frankly
  account that is itself tracked as a bank account.
- Bond/medical-aid debit orders pulling from one account when imported
  alongside a credit on the issuer account (rare, but treated the same
  way once identified).

Transfers in this model are **between two `ActualTransaction` rows of
the same household**. The matcher does NOT pair a transaction to an
unimported counter-leg — it only emits matches for rows already in
the ledger.

## Scoring model

Each candidate pair `(debit, credit)` gets a `confidence` in `[0,1]`
computed as the sum of signal contributions, capped at `1.0`:

| Signal                                                                  | Contribution | Notes                                                              |
| ----------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------ |
| Same household                                                          | required     | Hard precondition. Rows from different households are NEVER paired. |
| Sign opposition: debit < 0 and credit > 0                               | required     | Hard precondition.                                                 |
| Currency equal                                                          | +0.30        | Same-currency direct transfer.                                     |
| Currency differs AND both have FX hints in `raw`                        | +0.25        | Cross-currency exchange.                                           |
| `abs(amount_debit) == amount_credit`                                    | +0.30        | Exact-amount pair (same currency).                                 |
| Amount-with-FX match: `abs(amount_debit) * fxRate ≈ amount_credit`      | +0.30        | Within 1% of the FX rate captured in `raw.exchangeRate`.           |
| Booking dates within 0 days                                             | +0.20        | Same-day.                                                          |
| Booking dates within 1 day                                              | +0.12        |                                                                    |
| Booking dates within 3 days                                             | +0.06        |                                                                    |
| Booking dates within 7 days                                             | +0.02        |                                                                    |
| `debit.accountId != credit.accountId` and both non-null                 | +0.10        | Distinct household accounts both linked.                           |
| One side is account-less import (no `accountId`) and the other has one  | +0.05        | Weaker than the both-linked case.                                  |
| Both descriptions contain "transfer"                                    | +0.05        | Generic transfer-keyword boost.                                    |
| Country profile transfer heuristic match (e.g. `saeule 3a`, `pillar 3a`)| +0.15 (capped) | Profile-defined boost. Multiple heuristics on one row sum, capped at +0.15. |
| Reference equality (`debit.reference == credit.reference`, non-null)    | +0.20        | Strong same-instruction signal.                                    |
| Counterparty cross-match (debit's counterparty == credit's account name OR vice versa) | +0.10 | Weak; needs household account name knowledge.                      |

A pair becomes a `TransactionTransferMatch` row when
`confidence >= 0.60`. Below that, the pair is dropped (not stored as
a low-confidence match — keeps the table small and the false-positive
risk bounded).

## Hard preconditions

A pair is only considered if ALL of:

1. Same household.
2. Sign opposition.
3. Booking dates within ±7 days.
4. Neither row is already part of a higher-confidence match.

## Pair search

For an incoming committed import:

1. Load the import's `ActualTransaction` rows.
2. For each row, query candidates from the same household where:
   - opposite sign,
   - booking date in `[row.bookingDate − 7d, row.bookingDate + 7d]`,
   - `(currency = row.currency)` OR (row carries an FX rate hint in
     `raw.exchangeRate`).
   - not already in `TransactionTransferMatch` with confidence ≥ 0.85.
3. Score each candidate.
4. Greedy pair: highest score first; remove both rows from the pool;
   continue.
5. Persist pairs with `confidence >= 0.60`.

The greedy pairing assumes a 1:1 transfer model. v1 does NOT handle
N:1 (multiple debits funding one credit, e.g. partial transfers) —
those stay unmatched and flow into spending. Flag as a follow-up if
real data shows this is common.

## FX rate handling

For cross-currency pairs:

- Prefer the FX rate carried in either side's `raw.exchangeRate`
  field (UBS camt.053 `CcyXchg/XchgRate`, UBS card CSV `Kurs`).
- If neither row carries a rate, fall back to the household's
  exchange-rate cache (`lib/exchange-rates.ts`) for the booking date.
- Tolerance: `|expected − actual| / expected ≤ 0.01` (1%).

## Idempotency

The `TransactionTransferMatch.{householdId, debitTransactionId,
creditTransactionId}` unique constraint already ensures that
re-running the matcher does not create duplicate rows.

On re-run with new candidates (e.g. user imports the EUR side of a
Revolut exchange after the CHF side was already in the ledger), the
matcher:

1. Looks for unmatched rows in the affected window.
2. Pairs them as above.
3. Existing higher-confidence matches are immutable for v1 — the
   matcher never re-scores or upgrades an existing pair.

## Visibility in `/analysis`

A matched pair shows:

- In the transaction table, both rows display a "Transfer" badge with
  the confidence.
- A filter `?excludeTransfers=true` strips matched-pair rows from
  spending aggregates.
- In the review queue, a confidence in `[0.60, 0.75)` shows a "Confirm
  transfer" prompt — the user can accept (sets
  `reviewState = confirmed`) or reject (deletes the match row).
- `confidence >= 0.75` is auto-confirmed and shows no prompt; the
  user can still split the pair manually from the row detail panel.

## Confirmation overrides

When a user confirms a transfer pair, two side effects:

1. Both rows' `reviewState` becomes `confirmed`.
2. An audit row is written with action `transfer_match_confirm`.

When a user rejects:

1. The `TransactionTransferMatch` row is deleted.
2. Both rows' `reviewState` returns to whatever they were before
   (use `notes` field to record the manual override so the matcher
   doesn't re-pair them in the next import).

## Edge cases

| Case                                                              | Behaviour                                                                              |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Two rows on the same account with equal but opposite amounts      | Skip (would be a duplicate or reversal, not a transfer). Codex: enforce `debit.accountId != credit.accountId` when both linked. |
| Fee-split sibling rows                                            | Excluded from matching. The matcher skips rows whose `reference` ends with `:fee`.     |
| Reversal rows (`description` starts with `REVERSAL: `)            | Excluded from matching.                                                                |
| One row has account, the other does not                           | Allowed; counted via the weaker +0.05 boost.                                           |
| User has 3 accounts; same-day transfer fans out                   | Greedy pairs the highest-score pair first; remaining unmatched rows fall through.      |
| Pillar 3a contribution where the 3a account is NOT tracked        | No counter-leg in the ledger. The row stays unmatched but the country-profile heuristic adds `transferCandidate = true` to `notes` so advice can ignore it as spending. |

## Implementation notes for Codex

- Implement `runTransferMatching({ householdId, sinceBookingDate })`
  as a deterministic, idempotent function. Calling it twice in a row
  produces the same `TransactionTransferMatch` rows.
- Wire it into the statement-import commit transaction (after row
  insert, before audit emission) so each import auto-triggers matching
  on the affected date window.
- Avoid scanning the whole ledger — the candidate query is bounded by
  the booking-date window. Use the existing
  `ActualTransaction(householdId, bookingDate)` index.
- Confidence is stored as a `Decimal(8,6)` (already in migration);
  return as string at the API boundary.

## Open questions

1. Should the matcher consider `valueDate` instead of `bookingDate`
   when the row carries one? Initial answer: `bookingDate` only, to
   keep the index aligned. Revisit if Swiss card → CHF settlement
   pairs miss by a day.
2. Should we expose a re-run endpoint (admin only) for backfilling
   matches after onboarding finishes loading historical imports?
   Initial answer: yes, behind an admin guard; out of scope for the
   spec.
3. Should low-confidence (`[0.40, 0.60)`) pairs be persisted as
   "suggested" so the user can confirm them in the review queue?
   Initial answer: no for v1 — false positives outweigh the recall
   gain. Revisit after first real-sample testing.
