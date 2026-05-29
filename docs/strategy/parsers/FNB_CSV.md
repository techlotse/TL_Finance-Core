# FNB CSV parser spec

- **Parser key**: `fnb-csv`
- **Institution**: `fnb`
- **MIME hints**: `text/csv`, `application/vnd.ms-excel`
- **Extension hints**: `.csv`
- **Fixture pair**: `src/lib/statements/parsers/__fixtures__/fnb-cheque-may.csv`
  and `fnb-cheque-may.expected.json`

First National Bank (South Africa) Online Banking CSV statement
export. Public reference:
[FNB CSV statement file specification](https://www.online.fnb.co.za/rhelp_0_15/Downloads/Statement_File_Specifications/Statement_Type_-_CSV.pdf).

The FNB CSV is a fixed-section file, not a single header + rows like
Revolut. It has account header rows, totals rows, and transaction
detail rows, each identified by a record-type column.

## File shape

Per the FNB spec, each line begins with a record-type marker. The
shapes the parser must handle:

```
1,<accountNumber>,<accountName>,<currency>,<accountType>,<branchCode>,<openingBalance>,<closingBalance>
3,<dateOfStatement>,<fromDate>,<toDate>
5,<accountNumber>,<postingDate>,<txnNumber>,<description1>,<description2>,<description3>,<amount>,<balance>,<accruedBankCharges>
6,<endOfStatementTotals>
```

Record types observed:

| Code | Meaning                       | Parser action                                 |
| ---- | ----------------------------- | --------------------------------------------- |
| `1`  | Account header                | Capture account identifier, name, currency, opening + closing balances. |
| `3`  | Statement period header       | Capture period; store in metadata.            |
| `5`  | Transaction detail            | Normalize into `NormalizedTransactionRow`.    |
| `6`  | Trailer / totals              | Use for closing-balance reconciliation if present; otherwise rely on record-1 closing. |

Dates: `CCYY/MM/DD` (e.g. `2026/05/31`). `parseDateToIsoDate` does NOT
auto-handle slash-separated YYYY/MM/DD (it expects day-first when
separators are `/` or `.`). The parser MUST detect the YYYY-first
shape and reformat to `YYYY-MM-DD` before calling the helper, OR call
its own ISO-tolerant fast path.

Currency: ZAR by default. The account header carries an explicit
currency token.

## Detection

`detect()`:

1. Reject if `input.text` is null.
2. Look for a line that begins with `1,` followed by an account number
   pattern (`\d{6,12}`) and `ZAR` in the currency slot.
3. `confidence`:
   - 0.96 — record-1 header found AND at least one record-5 line in
     first 50 rows.
   - 0.80 — record-1 found but no record-5 yet (might be header-only
     truncation).
   - 0 — otherwise.

## Parsing rules

### Account header (record 1)

Field order (per FNB spec):

```
1, accountNumber, accountName, currency, accountType, branchCode,
   openingBalance, closingBalance
```

Parser captures:

- `accountIdentifier = accountNumber`.
- `accountName = accountName`.
- `defaultCurrency = currency`.
- `balances.opening = parseMoneyToDecimalString(openingBalance)`.
- `balances.closing = parseMoneyToDecimalString(closingBalance)`.

If multiple record-1 lines appear, only the first is parsed and
`multi_account_file` is emitted with the additional account numbers
in `message`.

### Statement period (record 3)

Captured into statement metadata only. Not used for row filtering.

### Transaction (record 5)

Field order:

```
5, accountNumber, postingDate, txnNumber, description1, description2,
   description3, amount, balance, accruedBankCharges
```

- `bookingDate = postingDate` (reformatted from `YYYY/MM/DD`).
- `valueDate = null` (FNB CSV has no separate value date).
- `description` = join non-empty of `description1`, `description2`,
  `description3` with ` · `.
- `counterparty = null` (description carries it).
- `reference = txnNumber` (FNB's per-transaction reference).
- `amount` = signed; FNB convention is outflows negative, inflows
  positive — verify the sign comes from the file (not invert). Apply
  `parseMoneyToDecimalString`.
- `currency = defaultCurrency` from the record-1 header.
- `balanceAfter = parseMoneyToDecimalString(balance)`.
- `accruedBankCharges`: if non-zero, emit a sibling fee-split row
  identical to Revolut's pattern:
  - description = `<original> — Bank charges`.
  - amount = `-|accruedBankCharges|`.
  - reference = `<txnNumber>:fee`.
  - top-level warning `fee_split` (single, with referenced row
    numbers).
- `normalizedMerchantKey = normalizeMerchantKey(description)`.

### Trailer (record 6)

Optional. If present, use the trailer's stated closing balance as the
authoritative closing for reconciliation; else use record-1's closing.

### Balance reconciliation

`opening + sum(rows including fee splits)` compared to closing with
`0.01` tolerance. Mismatch → `balance_mismatch` warning.

### Skipped rows

- Missing/unparseable `postingDate` → skip + `invalid_date`.
- Missing all three description fields → skip + `missing_description`.
- Missing amount → skip + `invalid_amount`.
- Record type outside `{1, 3, 5, 6}` → skip + `unsupported_row_type`.

## Acceptance fixture: `fnb-cheque-may`

ZAR cheque account, May 2026. Mixes salary, debit orders (medical aid,
bond, insurance), groceries, fuel, ATM with charges, SARS payment, and
an internal transfer to a savings pocket.

### Header

- Account number: `62812345678`.
- Name: `MR S RUAN`.
- Currency: `ZAR`.
- Account type: `Cheque`.
- Opening balance: `R 18,450.00`.
- Closing balance: `R 19,178.32`.

### Row expectations

| #   | postingDate | txnNumber | description (joined)                                    | amount       | balance      | charges | Notes                                    |
| --- | ----------- | --------- | ------------------------------------------------------- | ------------ | ------------ | ------- | ---------------------------------------- |
| 1   | 2026-05-01  | 1001      | `Salary · TechLotse · Salary May 2026`                  | `+35000.00`  | `53450.00`   | 0       | Inflow.                                  |
| 2   | 2026-05-02  | 1002      | `Debit Order · Discovery Health · Medical aid 2026/05`  | `-4250.00`   | `49200.00`   | 0       |                                          |
| 3   | 2026-05-02  | 1003      | `Debit Order · Standard Bank · Bond 2026/05`            | `-12300.00`  | `36900.00`   | 0       |                                          |
| 4   | 2026-05-03  | 1004      | `Debit Order · Outsurance · Vehicle insurance`          | `-1450.00`   | `35450.00`   | 0       |                                          |
| 5   | 2026-05-05  | 1005      | `Card Purchase · Checkers Sandton · `                   | `-1245.50`   | `34204.50`   | 0       |                                          |
| 6   | 2026-05-08  | 1006      | `Card Purchase · Engen Fourways · Fuel`                 | `-950.00`    | `33254.50`   | 0       |                                          |
| 7   | 2026-05-12  | 1007      | `ATM Withdrawal · FNB ATM Rosebank · `                  | `-2000.00`   | `31254.50`   | 8.50    | Fee split row 7a.                        |
| 8   | 2026-05-15  | 1008      | `EFT Payment · SARS · IT12 2025 tax assessment`         | `-8500.00`   | `22754.50`   | 0       |                                          |
| 9   | 2026-05-18  | 1009      | `Transfer to Savings Pocket`                            | `-3000.00`   | `19754.50`   | 0       | Internal transfer candidate.             |
| 10  | 2026-05-20  | 1010      | `Card Purchase · Pick n Pay Sandton · `                 | `-585.18`    | `19169.32`   | 0       |                                          |
| 11  | 2026-05-25  | 1011      | `Credit · MTN Refund · Airtime reversal`                | `+25.00`     | `19194.32`   | 0       |                                          |
| 12  | 2026-05-29  | 1012      | `Card Purchase · Eskom · Prepaid electricity`           | `-16.00`     | `19178.32`   | 0       |                                          |

Sum check:
`18450 + 35000 − 4250 − 12300 − 1450 − 1245.50 − 950 − 2000 − 8.50 − 8500 − 3000 − 585.18 + 25 − 16 = 19169.82`.

That does not match closing `19178.32`. The fixture must reconcile, so
adjust the SARS line down by `R 8.50` to absorb the fee:

**Reconciled row 8**: `-8491.50`, balance `22763.00`. Then the rest:
- Row 9 balance: `22763.00 − 3000 = 19763.00`.
- Row 10 balance: `19763.00 − 585.18 = 19177.82`.
- Row 11 balance: `19177.82 + 25 = 19202.82`.
- Row 12 balance: `19202.82 − 16 = 19186.82`.

Still off. The cleanest fix: drop the ATM fee, set row 7 balance to
`31254.50`, leave row 8 at `-8500.00`. Then:
- Row 8 balance: `31254.50 − 8500 = 22754.50`. ✓
- Row 9 balance: `22754.50 − 3000 = 19754.50`. ✓
- Row 10 balance: `19754.50 − 585.18 = 19169.32`. ✓
- Row 11 balance: `19169.32 + 25 = 19194.32`. ✓
- Row 12 balance: `19194.32 − 16 = 19178.32`. ✓

Decision: **the ATM fee column is `0` in this fixture**; the
`fee_split` scenario moves to a dedicated follow-up fixture
(`fnb-cheque-with-charges.csv`). This keeps reconciliation arithmetic
clean and the first fixture focused on the record-type / sign /
description-join behavior.

The corrected row table above (treating charges = 0 everywhere) is
authoritative for the fixture below. The `expected.json` matches it.

### Detection expectations

- `matched: true`, `confidence >= 0.96`, reason mentions
  `FNB record-1 header`.

### Top-level expectations

- `parserKey === "fnb-csv"`.
- `institution === "fnb"`.
- `accountIdentifier === "62812345678"`.
- `accountName === "MR S RUAN"`.
- `rows.length === 12`.
- `warnings.length === 0` (no skips, no fee splits in this fixture).

## Edge cases reserved for follow-up fixtures

- `fnb-cheque-with-charges.csv` — exercises `fee_split`.
- `fnb-savings-multi-account.csv` — file with both cheque + savings
  records; verifies `multi_account_file` warning.
- `fnb-cheque-invalid-rows.csv` — exercises `invalid_date`,
  `missing_description`, `invalid_amount`, `unsupported_row_type`.
- `fnb-cheque-trailer.csv` — record-6 trailer reconciles to a
  different closing than record-1 by a small drift; asserts trailer
  precedence and `balance_mismatch` is NOT emitted when trailer wins.
- `fnb-business-online.csv` — FNB Business Online exports include
  extra columns (BIC, project code). Separate parser key
  `fnb-business-csv` if they diverge enough.

## Implementation notes for Codex

- Detect comma as the delimiter (FNB CSV is comma-only per spec).
- Quote handling: re-use `parseDelimitedText` from
  `parsers/generic-csv.ts` if possible; otherwise replicate.
- Row-iteration: walk every CSV row, dispatch on the first column.
  Account header MUST appear before any record-5; if record-5 is seen
  before record-1, emit `multi_account_file` semantics
  (`unsupported_row_type` is not quite right) and abort with `422`.
- The FNB CSV does not include a header column row; the parser is
  position-based per record type. This is the only parser in this
  repo that does NOT use `normalizeHeader`.
- `rowNumber` for warnings = 1-based index of the line in the CSV
  file (not just record-5 index). Keep consistent with other
  parsers' final decision.

## Open questions blocking real-sample upgrade

1. Confirm record-type marker set against a current FNB export — the
   spec PDF lists 1/3/5 but I have not personally verified record-6 is
   used by retail Online Banking exports.
2. Confirm whether FNB inserts a UTF-8 BOM at the file start
   (`﻿`). If so, parser must strip before record-1 detection.
3. Confirm sign convention for `amount` on record-5: I have spec-read
   it as already signed (outflow negative), but some bank exports
   pre-sign and others rely on a separate `Cr/Dr` column. Real sample
   needed.
4. Confirm whether the `accruedBankCharges` column is per-transaction
   or cumulative. Spec text reads per-transaction; fixture assumes so.
