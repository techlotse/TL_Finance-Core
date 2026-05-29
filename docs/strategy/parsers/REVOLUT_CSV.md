# Revolut CSV parser spec

- **Parser key**: `revolut-csv`
- **Institution**: `revolut`
- **MIME hints**: `text/csv`
- **Extension hints**: `.csv`
- **Fixture pair**: `src/lib/statements/parsers/__fixtures__/revolut-eur-may.csv`
  and `revolut-eur-may.expected.json`

Revolut "Account Statement (per currency)" CSV export. Public reference:
[Revolut statement help](https://help.revolut.com/help/profile-and-plan/managing-my-account/account-statement-per-chosen-currency/).

Each export is **per currency**: a user with EUR + CHF + GBP wallets
produces three separate CSV files. The parser treats each file as one
statement; cross-currency `EXCHANGE` rows are emitted as ordinary rows
in their respective files and paired later by `transfer-match.ts`.

## Column header (current export)

```
Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
```

Earlier exports omit `Product` and `Fee`. The parser is alias-driven
and tolerates either.

## Header alias table

| Logical field   | Aliases                                                |
| --------------- | ------------------------------------------------------ |
| type            | `type`                                                 |
| product         | `product`                                              |
| startedDate     | `started_date`, `start_date`                           |
| completedDate   | `completed_date`, `posted_date`                        |
| description     | `description`, `details`                               |
| amount          | `amount`                                               |
| fee             | `fee`                                                  |
| currency        | `currency`                                             |
| state           | `state`, `status`                                      |
| balance         | `balance`, `running_balance`                           |

## Detection

`detect()`:

1. Reject if `input.text` is null.
2. Look for header line containing all of `type`, `started_date`,
   `amount`, `currency`, `state` (normalized). The `completed_date`
   token is allowed but not required.
3. `confidence`:
   - 0.97 — header includes both `product` and `state`, and at least one
     data row's `type` value is in the Revolut set
     (`TOPUP|TRANSFER|CARD_PAYMENT|EXCHANGE|ATM|REWARD|FEE|REFUND|CASHBACK|INTEREST`).
   - 0.85 — header matches but `type` set is generic.
   - 0 — otherwise.

## Parsing rules

### Type → behavior

| Type           | Behavior                                                                     |
| -------------- | ---------------------------------------------------------------------------- |
| `TOPUP`        | Emit row. Amount sign from `Amount` column (already signed inflow positive). |
| `TRANSFER`     | Emit row. Sign from `Amount`. Candidate for transfer-match.                  |
| `CARD_PAYMENT` | Emit row. Sign from `Amount` (negative for outflow).                         |
| `ATM`          | Emit row. Sign from `Amount`.                                                |
| `EXCHANGE`     | Emit row. Sign from `Amount`. The counter-leg lives in a different file (other currency) — pair downstream. |
| `REWARD`       | Emit row.                                                                    |
| `CASHBACK`     | Emit row.                                                                    |
| `REFUND`       | Emit row (positive).                                                         |
| `INTEREST`     | Emit row.                                                                    |
| `FEE`          | Emit row.                                                                    |
| unknown        | Skip + warning `unsupported_row_type`.                                       |

### State → behavior

| State        | Behavior                                                        |
| ------------ | --------------------------------------------------------------- |
| `COMPLETED`  | Emit.                                                           |
| `PENDING`    | Skip + warning `pending_row`.                                   |
| `REVERTED`   | Skip + warning `reversed_row` (Revolut convention: the original |
|              | row is left in place AND a REVERTED entry exists; emitting both |
|              | would double-count. Spec drops REVERTED rows; original keeps.). |
| `FAILED`     | Skip + warning `failed_row`.                                    |
| `DECLINED`   | Skip + warning `failed_row`.                                    |
| unknown      | Skip + warning `unknown_status`.                                |

### Dates

- `Started Date` and `Completed Date` are ISO-like timestamps:
  `2026-05-03 14:22:51`. Parser takes the date portion.
- `bookingDate` = `Completed Date` if present and parseable, else
  `Started Date`. Missing both → `invalid_date` and skip.
- `valueDate` = `Started Date` (kept for FX timing). If equal to
  bookingDate, store anyway (downstream may use one or the other).

### Amount and fee

- `Amount` is already signed in Revolut exports (negative for outflows,
  positive for inflows). Parser passes through
  `parseMoneyToDecimalString` unchanged.
- `Fee` column, when present and non-zero, is **subtracted from the
  account** independently. The parser emits a sibling row:
  - same dates, same currency, same type code in `raw.type`.
  - `description = f"{original description} — Fee"`.
  - `amount = -|fee|` (always negative; Revolut never refunds a fee
    in the same row).
  - `reference = original reference + ":fee"`.
  - Warning `fee_split` is added top-level (once, with rowNumbers of
    each split row in `message`).

Codex: this ensures balance reconciliation works without manually
parsing `Balance` deltas. The `Balance` column reflects post-fee state
already; emitting the fee as its own ledger row makes the math line up.

### Currency

Per-row `Currency` column. The whole file should be one currency, so
the parser MUST verify all rows match and emit warning
`multi_account_file` if any row's currency differs from the first
row's currency (Revolut sometimes interleaves cross-currency rows by
mistake in legacy exports).

### Description, counterparty, reference

- `description` = Revolut `Description` column verbatim.
- `counterparty` = null. Revolut does not split it cleanly.
- `reference` = null (no stable per-row reference column). Dedupe
  relies on `(date, amount, description)`.
- `normalizedMerchantKey` = `normalizeMerchantKey(description)`.

### Balance reconciliation

Revolut exports include a `Balance` column on every row. The parser:

1. Computes opening balance from first row: `firstBalance - firstSigned`
   (where firstSigned = amount + (fee if split was emitted)).
2. Computes closing balance from last row's `Balance`.
3. Confirms `opening + sum(rows) ≈ closing` within `0.01`.
4. On mismatch → top-level warning `balance_mismatch`.

Top-level metadata includes `balances.opening` and `balances.closing`
for downstream display.

## Acceptance fixture: `revolut-eur-may`

EUR wallet, May 2026. 12 rows including an FX EXCHANGE, a REFUND, a
fee-split, a REVERTED, a PENDING, and a DECLINED.

### Column header

`Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance`

### Row expectations

| #   | Type         | Started Date         | Completed Date       | Description                       | Amount  | Fee  | State     | Balance | Notes                              |
| --- | ------------ | -------------------- | -------------------- | --------------------------------- | ------- | ---- | --------- | ------- | ---------------------------------- |
| 1   | TOPUP        | 2026-05-01 09:00:00  | 2026-05-01 09:00:05  | Apple Pay top-up                  | 500.00  | 0.00 | COMPLETED | 500.00  | Inflow.                            |
| 2   | CARD_PAYMENT | 2026-05-03 12:15:00  | 2026-05-03 12:15:02  | Lidl Berlin                       | -42.50  | 0.00 | COMPLETED | 457.50  | Outflow.                           |
| 3   | EXCHANGE     | 2026-05-04 08:00:00  | 2026-05-04 08:00:01  | Exchanged to CHF                  | -100.00 | 0.00 | COMPLETED | 357.50  | Counter-leg in CHF file.           |
| 4   | TRANSFER     | 2026-05-06 10:00:00  | 2026-05-06 11:00:00  | Sent to John Doe                  | -50.00  | 0.50 | COMPLETED | 307.00  | Fee split → row 4a `-0.5000`.      |
| 5   | CARD_PAYMENT | 2026-05-08 19:30:00  | 2026-05-09 03:00:00  | Netflix.com                       | -15.99  | 0.00 | COMPLETED | 291.01  |                                    |
| 6   | REFUND       | 2026-05-10 14:00:00  | 2026-05-10 14:30:00  | Lidl Berlin                       | 42.50   | 0.00 | COMPLETED | 333.51  | Mirrors row 2.                     |
| 7   | ATM          | 2026-05-12 22:10:00  | 2026-05-12 22:10:05  | ATM Berlin Hbf                    | -100.00 | 2.00 | COMPLETED | 231.51  | Fee split → row 7a `-2.0000`.      |
| 8   | CARD_PAYMENT | 2026-05-15 09:45:00  | 2026-05-15 09:45:01  | Coffee shop                       | -3.50   | 0.00 | PENDING   |         | Skip → `pending_row`.              |
| 9   | CARD_PAYMENT | 2026-05-17 11:00:00  | 2026-05-17 11:00:01  | Failed merchant                   | -25.00  | 0.00 | DECLINED  |         | Skip → `failed_row`.               |
| 10  | CARD_PAYMENT | 2026-05-18 11:00:00  | 2026-05-18 11:00:01  | Refunded merchant                 | -10.00  | 0.00 | REVERTED  |         | Skip → `reversed_row` (no emit).   |
| 11  | REWARD       | 2026-05-25 00:00:00  | 2026-05-25 00:00:00  | Stays referral cashback           | 5.00    | 0.00 | COMPLETED | 236.51  |                                    |
| 12  | INTEREST     | 2026-05-31 23:59:00  | 2026-05-31 23:59:00  | Savings interest                  | 1.20    | 0.00 | COMPLETED | 237.71  |                                    |

Emitted rows after parsing: 8 visible rows (1, 2, 3, 4, 5, 6, 7, 11,
12) plus 2 fee-split rows (4a, 7a) = **11 rows total**.

### Balance reconciliation

- Opening = `500.00 − 500.00 = 0.00` (computed from row 1).
- Sum of signed amounts (including fee splits):
  `+500 − 42.50 − 100 − 50 − 0.50 − 15.99 + 42.50 − 100 − 2 + 5 + 1.20 = 237.71`.
- Closing from last visible row's Balance = `237.71`.
- Matches; no `balance_mismatch` warning.

### Detection expectations

- `matched: true`, `confidence >= 0.97`, reason mentions
  `Revolut header`.

### Top-level expectations

- `parserKey === "revolut-csv"`.
- `institution === "revolut"`.
- `accountName === null` (file does not expose user identity).
- `accountIdentifier === null`.
- `rows.length === 11`.
- `warnings` set: `{ fee_split, pending_row, failed_row, reversed_row }`.
  - `fee_split` appears once at the top level with `message`
    referencing rowNumbers of both split sibling rows.

## Edge cases reserved for follow-up fixtures

- `revolut-csv-multi-currency-leak.csv` — file with one mismatched
  currency row; asserts `multi_account_file` warning.
- `revolut-csv-pre-fee-export.csv` — legacy export without `Fee` and
  `Product` columns; asserts compatibility.
- `revolut-csv-savings-vault.csv` — vault movements as `TRANSFER` to
  verify internal-transfer matching.
- `revolut-csv-fx-pair-chf.csv` — companion to `revolut-eur-may.csv`
  carrying the CHF side of row 3's exchange; asserts
  `transfer-match.ts` pairs them.

## Implementation notes for Codex

- Header detection: tolerate optional `Product` and `Fee` columns.
- Date parser MUST take date portion before the first space, then run
  through `parseDateToIsoDate`.
- Sign of `Amount`: passthrough — DO NOT invert. Revolut signs the
  column itself.
- Emit fee-split rows ONLY when `Fee` is parseable and non-zero. A
  blank or zero fee means no split.
- The dedupe hash naturally distinguishes the main row from its fee
  sibling via the differing `description` and `reference`.

## Open questions blocking real-sample upgrade

1. Does Revolut emit `FEE` as a standalone row type (in addition to the
   per-row `Fee` column), or only as a column? If both, spec needs to
   handle "I already saw this fee, do not double-count."
2. Confirm the format of the `Balance` column for `REVERTED` and
   `PENDING` rows — empty, or carries the pre-event balance?
3. Confirm whether the `EXCHANGE` row's `Description` contains the
   counter-currency (`Exchanged to CHF`) consistently — this is the
   matching key for cross-file FX pairing.
