# Revolut XLSX parser spec

- **Parser key**: `revolut-xlsx`
- **Institution**: `revolut`
- **MIME hints**: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- **Extension hints**: `.xlsx`
- **Fixture pair**: deferred — see "Fixture strategy" below

The Revolut XLSX export is a one-sheet workbook that mirrors the CSV
schema described in [`REVOLUT_CSV.md`](./REVOLUT_CSV.md). The parser
re-uses the same normalization, sign convention, type/state behavior,
fee-split logic, and balance reconciliation as the CSV parser. Only
the input decoding differs.

## File shape

- Single worksheet, name varies (`Sheet1`, `<Currency> account`, or the
  account label).
- Row 1: column header.
- Row 2+: data rows.
- No metadata block above the header (unlike UBS card CSV).

The XLSX may include a frozen header row and basic cell formatting
(date cells as Excel date serials, money cells as numbers). The parser
MUST handle both serialized and string cell types.

## Decoding

`input.bytes` is the source. `input.text` will be null for true XLSX
files because the multipart route decoded the binary as UTF-8 (yielding
gibberish). The parser MUST:

1. Detect XLSX magic bytes (`PK\x03\x04` ZIP prefix) on
   `input.bytes`.
2. Decode the workbook with a library available in the existing
   dependency tree. **Library decision pending** — Codex should pick
   between:
   - `xlsx` / `sheetjs` (already used by analyst tooling; mature, large
     bundle).
   - `exceljs` (smaller; streaming worksheet reader).
   The artifacts/runtime sections describe `xlsx` as available, so the
   parser defaults to `xlsx`. If bundle size or licence is a concern,
   Codex may switch to `exceljs` — fixture expectations are
   library-independent.
3. Read the first worksheet only (warn `multi_account_file` if more
   than one worksheet exists; do not parse the extras).
4. Convert the worksheet to a row-array (`sheet_to_json` with
   `header: 1` and `raw: true`).

## Normalisation parity with CSV

After decoding, the parser converts each row into the same
column-keyed object that the CSV parser produces, then dispatches to
the shared `parseRevolutRows` helper that `revolut-csv` also uses.
This gives identical row-level behavior and warnings.

Date cells require an extra step:

- Excel date serial (numeric, e.g. `45413`) → convert to ISO date via
  `new Date(Date.UTC(1899, 11, 30) + serial * 86400000)`.
- ISO string cell → pass through to `parseDateToIsoDate`.

Money cells:

- Numeric → `parseMoneyToDecimalString(String(value))`.
- String with `€`/`CHF`/`USD` prefixes → `parseMoneyToDecimalString`
  already strips them.

## Detection

1. Reject if `input.bytes` is null or first four bytes are not
   `[0x50, 0x4B, 0x03, 0x04]`.
2. Decode the workbook lazily (avoid full row scan on detection).
3. Read the first row of the first sheet; if header matches Revolut's
   alias set (same as CSV), return `matched: true, confidence: 0.94`.
   - 0.97 if the workbook's `Title` / `Subject` core property contains
     `Revolut` (some exports include it).

## Detection failure modes

- File is a ZIP but not an XLSX → throw `422` with message
  "File is not a recognized XLSX workbook".
- XLSX with no sheets → `422` "Workbook contains no sheets".
- First row does not match Revolut header aliases → `matched: false`.

## Fixture strategy

Hand-authoring a synthetic XLSX in this branch is overhead-heavy —
binary fixtures don't review well in PRs. Codex should generate the
fixture at test time from the CSV fixture, using the same library it
uses to read XLSX:

1. In `revolut-xlsx.test.ts`, read `revolut-eur-may.csv`.
2. Use `XLSX.utils.aoa_to_sheet` + `XLSX.write({ type: "buffer" })` to
   produce an in-memory XLSX buffer.
3. Pass that buffer through `createStatementInput({ bytes: buffer })`.
4. Assert the parser output equals `revolut-eur-may.expected.json`
   (the CSV's expected output, sans CSV-specific notes).

This guarantees CSV and XLSX parser parity automatically — any
divergence is a test failure.

If a real-sample XLSX arrives later, commit it as
`revolut-eur-may-real.xlsx` plus `revolut-eur-may-real.expected.json`
and the test loads the binary directly. Synthetic XLSX generation
stays as the smoke test.

## Acceptance criteria (Phase 3 exit)

- `revolut-xlsx.test.ts` re-uses `revolut-eur-may.expected.json` for
  row content.
- Detection asserts `confidence >= 0.94`.
- Parser produces identical rows to `revolut-csv` for the same logical
  data.
- A workbook with a second sheet emits `multi_account_file` warning.

## Implementation notes for Codex

- Avoid full-file `XLSX.read({ type: "binary" })` on the multipart
  bytes — that double-decodes. Use `XLSX.read(buffer, { type: "buffer" })`.
- Set `cellDates: true` so Excel date serials surface as `Date`
  objects; then `toISOString().slice(0,10)`.
- Cap workbook row count at the same `MAX_STATEMENT_IMPORT_BYTES`
  limit at the request layer — the parser itself does not enforce
  upload size.
- Share the row-to-NormalizedRow mapping function between
  `revolut-csv.ts` and `revolut-xlsx.ts` (export from a new
  `parsers/revolut-shared.ts`) to keep behavior identical.

## Open questions blocking real-sample upgrade

1. Confirm Revolut XLSX worksheet name pattern. If always `Account`,
   detection can boost confidence by 0.02.
2. Confirm whether XLSX exports include a totals row at the bottom
   (Excel often does). If so, the parser MUST detect and skip the
   totals row (heuristic: last non-empty row whose `Type` is empty or
   `Total`).
3. Confirm whether Revolut XLSX preserves the `Started Date` /
   `Completed Date` distinction or collapses to a single `Date` column
   in some product tiers.
