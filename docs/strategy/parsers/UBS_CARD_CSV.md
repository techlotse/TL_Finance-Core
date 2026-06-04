# UBS card CSV parser spec

- **Parser key**: `ubs-card-csv`
- **Institution**: `ubs`
- **MIME hints**: `text/csv`, `application/vnd.ms-excel` (UBS exports often label CSV as Excel)
- **Extension hints**: `.csv`
- **Fixture pair**: `src/lib/statements/parsers/__fixtures__/ubs-card-monthly.csv`
  and `ubs-card-monthly.expected.json`

UBS credit-card and Mastercard/Visa debit statements are typically
delivered as a semicolon-separated CSV from UBS e-banking
("Kartentransaktionen exportieren") rather than camt.053. This parser
handles that file.

## File shape

UBS card CSVs ship with a metadata header block followed by a row of
column headers and the transaction rows. Field set varies slightly
between Credit Card and Prepaid exports; the parser supports both by
header lookup, not position.

Typical header block (lines preceding the column header row):

```
Karte: 4571 **** **** 2851
Karteninhaber: Mustermann Max
Abrechnungswaehrung: CHF
Periode: 01.05.2026 - 31.05.2026
```

Typical column header row (semicolon-separated):

```
Kontonummer;Karte;Karteninhaber;Buchungsdatum;Belastungsdatum;Branche;Belastung;Gutschrift;Originalbetrag;Originalwährung;Kurs;Belastungswährung
```

Some exports use English variants:

```
Account number;Card;Cardholder;Booking date;Posting date;Sector;Debit;Credit;Original amount;Original currency;Rate;Settlement currency
```

The parser MUST recognise both header sets by normalized alias lookup.

## Header alias table

| Logical field        | Aliases (normalized; case-insensitive)                          |
| -------------------- | --------------------------------------------------------------- |
| bookingDate          | `buchungsdatum`, `booking_date`, `transaction_date`             |
| valueDate            | `belastungsdatum`, `posting_date`, `value_date`                 |
| description          | `beschreibung`, `description`, `details`, `branche`, `sector`   |
| debit                | `belastung`, `debit`                                            |
| credit               | `gutschrift`, `credit`                                          |
| originalAmount       | `originalbetrag`, `original_amount`                             |
| originalCurrency     | `originalwaehrung`, `original_currency`                         |
| exchangeRate         | `kurs`, `rate`, `exchange_rate`                                 |
| settlementCurrency   | `belastungswaehrung`, `settlement_currency`, `abrechnungswaehrung` |
| cardholder           | `karteninhaber`, `cardholder`                                   |
| accountIdentifier    | `kontonummer`, `account_number`, `karte`, `card`                |

`description` MAY be absent — UBS card exports often only carry
`Branche` (sector/merchant). The parser uses `Branche` as description in
that case (the actual merchant name is part of the row's `Branche`
field in retail card exports).

## Detection

`detect()`:

1. Reject if `input.text` is null.
2. Scan the first 30 non-empty lines for one of `Belastung;Gutschrift`,
   `Debit;Credit`, or `Originalbetrag` (semicolon-separated). Also
   accept a comma variant.
3. If matched AND the metadata block contains `Karte` or `Card` followed
   by a masked PAN pattern (`\d{4} \*+ \*+ \d{4}` or `\*{4,}\d{4}`):
   `confidence: 0.96`, `reason: "UBS card CSV header block"`.
4. If matched without UBS-specific markers but with the column set:
   `confidence: 0.82`, `reason: "Card CSV with Belastung/Gutschrift columns"`.
5. Otherwise `matched: false`.

## Parsing rules

### Metadata block

Lines before the column header row are scanned for `Key: Value`
pairs. Captured into a header bag and surfaced in the statement
metadata:

- `Karte`/`Card` → `accountIdentifier` (the masked PAN; the parser does
  NOT attempt to unmask).
- `Karteninhaber`/`Cardholder` → `accountName`.
- `Abrechnungswaehrung`/`Settlement currency` → default currency for
  rows that omit a per-row currency column.
- `Periode`/`Period` → optional, stored in `raw` and not validated.

### Delimiter

`parseDelimitedText` already auto-detects `,`, `;`, `\t`. Card CSVs are
semicolon-separated in DACH region; respect the helper's detection.

### Dates

UBS card CSV uses `DD.MM.YYYY`. `parseDateToIsoDate` already handles
this. `bookingDate` is required; `valueDate` is optional.

### Amount

The parser MUST handle three layouts in priority order:

1. **Debit + Credit columns** (preferred — current export format):
   - debit populated, credit empty → `amount = -debit`.
   - credit populated, debit empty → `amount = +credit`.
   - both populated → `invalid_amount` warning, skip.
   - both empty → check legacy single-amount column.
2. **Signed `Belastung` column** (legacy export): treat as already
   signed. Positive numbers are inflows, negative are outflows. The
   parser MUST NOT invert the sign.
3. **`Amount` column with `CR`/`DR` suffix** (export of consolidated
   statements): `'-12.34 DR'` → negative, `'+5.00 CR'` → positive.

Money strings always pass through `parseMoneyToDecimalString` to handle
Swiss thousands (`1'234.50`) and decimal-comma variants.

### Currency

- If a settlement-currency column exists per row, use it.
- Else if the header block had `Abrechnungswaehrung`, use that.
- Else use `input.defaultCurrency`.
- Else emit `missing_currency` and skip.

### FX columns

When `Originalbetrag`, `Originalwährung`, `Kurs` columns are present
and populated, the row is an FX transaction. The normalized row's
`amount`/`currency` still reflects the settlement (CHF) side — that's
what landed on the account. The original amount, currency, and rate
are captured in `raw`:

```
"originalAmount": "<value>",
"originalCurrency": "<ISO>",
"exchangeRate": "<value>"
```

Codex: do not emit a separate FX row. The matching against the source
account (when the user also imports e.g. a Revolut EUR account) is
done by `transfer-match.ts`, not in the parser.

### Counterparty and merchant key

UBS card CSV does not split counterparty cleanly. The parser:

- Sets `counterparty = null`.
- Sets `description` from the description-aliased column (typically the
  merchant string, e.g. `MIGROS GMM HIRSCHENGRABEN ZURICH`).
- Sets `normalizedMerchantKey` from `description` via
  `normalizeMerchantKey`. Test fixture asserts the expected keys
  (`migros gmm hirschengraben zurich` would normalize to `migros gmm hirschengraben zurich`
  — multi-word; categorization rules use `contains` match types, see
  `CATEGORIZATION_RULES.md`).

### Reference

UBS card CSV rarely carries a stable per-row reference. If no
reference column exists, set `reference = null` and rely on dedupe
hash (date + amount + description) to drop re-imports of the same
statement.

## Acceptance fixture: `ubs-card-monthly`

Synthetic UBS Mastercard statement for May 2026. CHF settlement;
contains one EUR FX row and one credit (refund) row.

### Header block

```
Karte: 4571 **** **** 2851
Karteninhaber: MAX MUSTERMANN
Abrechnungswaehrung: CHF
Periode: 01.05.2026 - 31.05.2026
```

### Row expectations

| #   | Buchungsdatum | Belastungsdatum | Branche / Description                         | Belastung | Gutschrift | Originalbetrag | Originalwährung | Kurs   | Normalized amount |
| --- | ------------- | --------------- | --------------------------------------------- | --------- | ---------- | -------------- | --------------- | ------ | ----------------- |
| 1   | 05.05.2026    | 06.05.2026      | `MIGROS GMM HIRSCHENGRABEN ZURICH`            | 34.85     |            |                |                 |        | `-34.8500`        |
| 2   | 07.05.2026    | 08.05.2026      | `SUNRISE GMBH ZUERICH`                        | 79.00     |            |                |                 |        | `-79.0000`        |
| 3   | 11.05.2026    | 12.05.2026      | `BOOKING.COM AMSTERDAM`                       | 124.30    |            | 130.00         | EUR             | 0.9562 | `-124.3000`       |
| 4   | 14.05.2026    | 15.05.2026      | `COOP-2435 BERN BAHNHOF`                      | 18.20     |            |                |                 |        | `-18.2000`        |
| 5   | 17.05.2026    | 18.05.2026      | `SBB AUTOMATIC TICKET`                        | 12.40     |            |                |                 |        | `-12.4000`        |
| 6   | 19.05.2026    | 20.05.2026      | `AMAZON EU SARL LUXEMBOURG`                   | 23.45     |            | 25.00          | EUR             | 0.9380 | `-23.4500`        |
| 7   | 22.05.2026    | 23.05.2026      | `BOOKING.COM REFUND`                          |           | 124.30     | 130.00         | EUR             | 0.9562 | `+124.3000`       |
| 8   | 28.05.2026    | 29.05.2026      | `JAHRESGEBUEHR MASTERCARD`                    | 100.00    |            |                |                 |        | `-100.0000`       |

Negative cases (in the CSV but skipped with warnings):

| Row in CSV | Trigger                                  | Warning                |
| ---------- | ---------------------------------------- | ---------------------- |
| 9          | Date column = `31.04.2026` (invalid)     | `invalid_date`         |
| 10         | Both Belastung AND Gutschrift populated  | `invalid_amount`       |
| 11         | Description blank AND counterparty null  | `missing_description`  |

### Top-level expectations

- `parserKey === "ubs-card-csv"`.
- `institution === "ubs"`.
- `accountIdentifier === "4571 **** **** 2851"`.
- `accountName === "MAX MUSTERMANN"`.
- `rows.length === 8`.
- `warnings` codes (set): `{ invalid_date, invalid_amount, missing_description }`.
- No `balance_mismatch` (UBS card CSV has no opening/closing in the
  metadata block in this fixture — the parser MUST NOT attempt
  reconciliation when balances aren't present).

## Edge cases reserved for follow-up fixtures

- `ubs-card-prepaid.csv` — UBS prepaid card layout (different column
  names; settlement currency may be non-CHF).
- `ubs-card-multiline-desc.csv` — descriptions containing embedded `;`
  and `"` to verify CSV quoting.
- `ubs-card-pending.csv` — pending vs posted column markers from
  pre-statement exports.

## Implementation notes for Codex

- Skip metadata lines until the column header row matches one of the
  aliases. Use a small lookahead (`scan top 50 lines`) to find the
  header row.
- Header detection must be language-aware: accept both German and
  English alias sets.
- Per-row currency falls back to header-block `Abrechnungswaehrung`,
  then `input.defaultCurrency`. Failure → `missing_currency`.
- `rowNumber` for warnings = 1-based index over **transaction rows**
  (i.e. the column-header row is row 0, first data row is row 1). This
  differs from generic CSV where rowNumber counts the entire file —
  Codex: align with generic-csv convention if simpler; spec is open on
  this point pending a decision.

## Open questions blocking real-sample upgrade

1. Confirm exact column header strings for current UBS e-banking
   export (Q2 2026). Aliases above are from publicly described UBS
   help-center samples and may not match production verbatim.
2. Does UBS card export ever include an `Original currency` column for
   non-FX rows (set to `CHF`), or is it left blank? Affects FX
   detection heuristic.
3. Confirm whether `Karte` masked PAN format is stable
   (`4571 **** **** 2851` vs `****2851` vs full PAN — full PAN must
   never be persisted; parser MUST reject and warn if it sees 16
   contiguous digits).
