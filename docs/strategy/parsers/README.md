# Statement Parser Specifications

This folder holds the per-format parser specifications and fixture
expectations that Codex implements against. It is the Claude side of the
joint handoff protocol in
[`docs/strategy/PRODUCT_SPLIT_AND_STATEMENT_INGESTION.md`](../PRODUCT_SPLIT_AND_STATEMENT_INGESTION.md).

## Contract reminder (do not redesign)

The parser contract is locked at `src/lib/statements/types.ts`. Every
parser MUST satisfy `StatementParser`:

```ts
interface StatementParser {
  key: string;
  institution: StatementInstitution;
  detect(input: StatementInput): ParserDetection;
  parse(input: StatementInput): Promise<NormalizedStatement>;
}
```

A parser must:

1. Be pure — no DB, no network, no fs writes. Input is a `StatementInput`
   with `text`, `bytes`, `fileName`, `mimeType`, `contentHash`,
   `defaultCurrency`. Output is a `NormalizedStatement` with rows and
   warnings.
2. Fail closed. If the booking date, sign, currency, or account identity
   cannot be inferred for a row, emit a `StatementWarning` and skip the
   row — never invent values.
3. Never silently drop a non-blank row. Every skipped row gets a warning
   with `code`, `message`, `rowNumber`, and (when relevant) `field`.
4. Use the canonical normalize helpers (`parseDateToIsoDate`,
   `parseMoneyToDecimalString`, `normalizeMerchantKey`, `normalizeHeader`)
   for value normalization. Do not roll bespoke parsing for these.
5. Set `parserVersion` to `STATEMENT_PARSER_VERSION` from `types.ts`.
6. Use `Decimal @db.Decimal(18, 4)` semantics — money strings on the
   wire, no `Float`.
7. Set sign by **outflow = negative, inflow = positive** consistently
   across all parsers, regardless of source format convention.
8. Populate `raw` with the original keyed cells / element values for that
   row so audit and reprocessing remain possible.
9. Compute `normalizedMerchantKey` from the most stable merchant signal
   the format exposes (counterparty name preferred over free-text
   description when both exist).

## Detection rules

- `detect()` MUST NOT throw. It returns `{ matched, confidence, reason }`.
- A parser MUST set `matched: false` if mandatory headers/elements are
  absent. Confidence is the registry's tiebreaker when multiple parsers
  match.
- Confidence guidance:
  - 0.95+ — institution-specific marker found (e.g. UBS BIC `UBSWCHZH80A`
    in camt.053, Revolut top-line header `Type,Product,Started Date,...`).
  - 0.80–0.94 — format-specific shape matched without institution marker
    (generic camt.053 envelope; FNB header block; Revolut header without
    bank identity).
  - 0.55–0.79 — fallback parsers (`generic-csv`).
  - 0.00 — not matched.

## Sign convention (every parser)

All `NormalizedTransactionRow.amount` strings are signed from the
account-holder's perspective:

| Source signal              | Normalized sign |
| -------------------------- | --------------- |
| `CdtDbtInd = DBIT`         | negative        |
| `CdtDbtInd = CRDT`         | positive        |
| Debit column populated     | negative        |
| Credit column populated    | positive        |
| Trailing `-`               | negative        |
| Parenthesized `(1.234,50)` | negative        |
| Leading `-`                | negative        |
| Otherwise positive         | positive        |

`parseMoneyToDecimalString` already handles trailing-minus and
parenthesized formats — parsers SHOULD rely on it instead of stripping
signs by hand.

## Date convention

`NormalizedTransactionRow.bookingDate` and `valueDate` are ISO date
strings (`YYYY-MM-DD`). Parsers use `parseDateToIsoDate` which already
recognises:

- `YYYY-MM-DD`, `YYYY-M-D`
- `YYYYMMDD`
- `DD.MM.YYYY`, `D.M.YYYY`, `DD/MM/YYYY`, `DD-MM-YYYY` (day-first when
  separators are `.`, `/`, or `-`)

Formats outside that set (US `MM/DD/YYYY`, banker's `Mon DD, YYYY`) are
NOT auto-detected — the parser MUST normalize them before calling the
helper, and document the format in this folder.

## Status handling

| Status code  | Behavior                                                            |
| ------------ | ------------------------------------------------------------------- |
| Posted/Booked| Emit a row.                                                         |
| Pending      | Skip + warn `code: pending_row`. Do not commit pending to ledger.   |
| Reversed     | Emit a row with opposite sign, description prefixed `REVERSAL: `.   |
| Failed       | Skip + warn `code: failed_row`.                                     |

## Reconciliation

When the format exposes opening and closing balances, the parser MUST:

1. Sum committed row amounts.
2. Compare `opening + sum(rows)` to `closing`. Tolerance:
   `Decimal("0.01")` per currency to absorb format rounding.
3. On mismatch, emit a top-level warning with code
   `balance_mismatch`, message including expected vs actual delta, and no
   `rowNumber`. Do not drop rows — the import preview surfaces the
   warning and lets the user cancel.

## Warning code catalogue

Parsers MUST use these codes (extend the list in this doc, not ad-hoc):

| Code                         | Meaning                                                |
| ---------------------------- | ------------------------------------------------------ |
| `invalid_date`               | Booking date unparseable.                              |
| `invalid_value_date`         | Value date unparseable; row still emitted.             |
| `missing_description`        | Row had no description and no counterparty.            |
| `missing_currency`           | No currency element and no `defaultCurrency` supplied. |
| `invalid_amount`             | Amount column unparseable.                             |
| `missing_sign`               | Amount present but sign indicator missing.             |
| `pending_row`                | Row skipped because status is pending.                 |
| `failed_row`                 | Row skipped because status is failed/cancelled.        |
| `reversed_row`               | Row emitted with opposite sign per reversal flag.      |
| `unknown_status`             | Status code outside the known set; row skipped.        |
| `balance_mismatch`           | Reconciliation against statement balances failed.      |
| `multi_account_file`         | File contained more than one account; only one parsed. |
| `unsupported_row_type`       | Row type the parser doesn't handle (skipped).          |
| `fee_split`                  | Parser split a row into transaction + separate fee.    |
| `low_confidence_detection`   | Parser ran with confidence < 0.80.                     |

## Fixture layout

Fixtures live at `src/lib/statements/parsers/__fixtures__/`. Each format
ships a pair:

- `<key>-<scenario>.<ext>` — synthetic statement file (XML/CSV/XLSX).
- `<key>-<scenario>.expected.json` — golden expected `NormalizedStatement`
  plus a header containing opening/closing balances and the row count.

All fixtures in this branch are **synthetic** — built from public format
specifications. They MUST be superseded by sanitized real samples before
the parser is marked production-ready (per Phase 3 exit criteria). The
header comment of each fixture declares its provenance and what it
covers.

## Per-format specs

| Format             | Spec                                                       | Fixture key      |
| ------------------ | ---------------------------------------------------------- | ---------------- |
| UBS camt.053 XML   | [`UBS_CAMT053.md`](./UBS_CAMT053.md)                       | `ubs-camt053`    |
| UBS card CSV       | [`UBS_CARD_CSV.md`](./UBS_CARD_CSV.md)                     | `ubs-card-csv`   |
| Revolut CSV        | [`REVOLUT_CSV.md`](./REVOLUT_CSV.md)                       | `revolut-csv`    |
| Revolut XLSX       | [`REVOLUT_XLSX.md`](./REVOLUT_XLSX.md)                     | `revolut-xlsx`   |
| FNB CSV            | [`FNB_CSV.md`](./FNB_CSV.md)                               | `fnb-csv`        |
| Generic CSV (fb)   | implemented at `src/lib/statements/parsers/generic-csv.ts` | `generic-csv`    |

## Joint handoff per format

1. Claude writes the spec doc and one synthetic fixture pair.
2. Codex implements the parser to satisfy the fixture, registers it in
   `STATEMENT_PARSERS` in `detect.ts`, and adds the test file
   `<key>.test.ts` next to `generic-csv.test.ts`.
3. Codex runs `npm run typecheck`, `npm run lint`, and the new vitest
   suite. Failures are reported back with fixture row references.
4. Claude reviews misclassifications and tightens the spec / fixture.
5. Codex integrates and reruns the full relevant checks.
6. Sanitized real samples replace the synthetic fixture before
   production cutover; the spec is updated to document any behavior the
   real sample exposed.
