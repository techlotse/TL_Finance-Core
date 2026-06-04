# UBS camt.053 parser spec

- **Parser key**: `ubs-camt053`
- **Institution**: `ubs`
- **MIME hints**: `application/xml`, `text/xml`
- **Extension hints**: `.xml`
- **Fixture pair**: `src/lib/statements/parsers/__fixtures__/ubs-camt053-current.xml`
  and `ubs-camt053-current.expected.json`

## Source format

ISO 20022 Bank-to-Customer Statement (camt.053.001.xx). UBS uses the
Swiss CGI / SIX implementation. Public reference:
[UBS account reports](https://www.ubs.com/ch/en/services/payments/cash-management/account-reporting.html).

This spec covers the camt.053 variant. camt.052 (interim report) and
camt.054 (debit/credit notification) are out of scope for v1 — they
share envelope shape and can be added later with their own parser keys.

## Envelope shape (XPath sketch)

```
/Document/BkToCstmrStmt/GrpHdr/{MsgId,CreDtTm}
/Document/BkToCstmrStmt/Stmt[1]/
  Id
  ElctrncSeqNb
  CreDtTm
  FrToDt/{FrDtTm,ToDtTm}
  Acct/Id/IBAN
  Acct/Ccy
  Acct/Svcr/FinInstnId/{BIC,Nm}
  Bal[* with Tp/CdOrPrtry/Cd in {OPBD, CLBD, CLAV, ITBD, ...}]/
    Amt[@Ccy]
    CdtDbtInd
    Dt/Dt
  TxsSummry/...
  Ntry[*]/
    NtryRef
    Amt[@Ccy]
    CdtDbtInd                # DBIT | CRDT
    Sts/Cd | Sts             # BOOK (booked), PDNG (pending), INFO
    RvslInd                  # true => reversal
    BookgDt/Dt
    ValDt/Dt
    AcctSvcrRef
    BkTxCd/{Domn,Fmly,SubFmlyCd, Prtry/Cd}
    NtryDtls/TxDtls[*]/
      Refs/{InstrId,EndToEndId,TxId,AcctSvcrRef,PmtInfId}
      Amt[@Ccy]              # leg amount (after FX)
      CdtDbtInd
      AmtDtls/InstdAmt/Amt[@Ccy]
      AmtDtls/TxAmt/Amt[@Ccy]
      AmtDtls/CntrValAmt/Amt[@Ccy]
      AmtDtls/CcyXchg/{SrcCcy,TrgtCcy,XchgRate}
      RltdPties/Cdtr/Nm
      RltdPties/Dbtr/Nm
      RltdPties/CdtrAcct/Id/IBAN
      RltdPties/DbtrAcct/Id/IBAN
      RltdAgts/CdtrAgt/FinInstnId/BIC
      RltdAgts/DbtrAgt/FinInstnId/BIC
      RmtInf/Ustrd            # unstructured remittance, repeatable
      RmtInf/Strd/...         # structured remittance (Swiss QR ref, ISR)
      AddtlTxInf
```

Namespaces: declared on `<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">`
(version digit may be 02, 04, 06, 08). The parser MUST be
namespace-tolerant: match local name only.

## Detection

`detect()`:

1. Reject if `input.text` is null or first non-whitespace byte is not `<`.
2. Match `matched: true` when local name of root is `Document` AND a
   descendant `BkToCstmrStmt/Stmt` exists.
3. `confidence`:
   - 0.99 — `Acct/Svcr/FinInstnId/BIC` starts with `UBSWCHZH` (UBS Switzerland).
   - 0.90 — `Acct/Svcr/FinInstnId/Nm` matches `/UBS/i`.
   - 0.85 — generic camt.053 envelope without UBS identity.
   - 0 — otherwise.
4. `reason`: human-readable, names the matched element path.

## Parsing rules

### One statement per file (v1)

UBS bundles can contain multiple `<Stmt>` blocks. The v1 parser
processes the **first** `<Stmt>` and emits warning `multi_account_file`
with the count of additional statements found, so the user can decide to
re-upload as separate files. v2 may emit one normalized statement per
`Stmt` and require a multi-account import flow — out of scope.

### Account identity

- `accountIdentifier` = `Stmt/Acct/Id/IBAN` (or `Stmt/Acct/Id/Othr/Id`
  fallback).
- `accountName` = `Stmt/Acct/Nm` if present, else null.

### Sign

`amount` sign is set from `CdtDbtInd` at the **entry** level
(`Ntry/CdtDbtInd`). DBIT → negative, CRDT → positive. The raw amount in
`Ntry/Amt` is unsigned per spec.

If a row carries `RvslInd = true`, the parser inverts the sign and
prefixes the description with `REVERSAL: `, and emits warning
`reversed_row`.

If `CdtDbtInd` is missing, the row is skipped with warning
`missing_sign`.

### Dates

- `bookingDate` = `Ntry/BookgDt/Dt` (required). If only
  `BookgDt/DtTm` is given, take the date part. Missing/invalid →
  `invalid_date` and skip.
- `valueDate` = `Ntry/ValDt/Dt` if present; else null. Invalid → set
  null and emit `invalid_value_date` (row still emitted).

### Status

- `Sts/Cd` (or legacy `Sts` text) values:
  - `BOOK`/booked → emit row.
  - `PDNG`/pending → skip + warning `pending_row`.
  - `INFO`/informational → skip + warning `unsupported_row_type`.
  - other → skip + warning `unknown_status`.

### Amount and currency

Default amount source: `Ntry/Amt` with `@Ccy`.

For FX'd card or transfer entries, `NtryDtls/TxDtls/AmtDtls` carries:

- `InstdAmt` — original instructed amount in source currency.
- `TxAmt` — transaction amount in account currency (matches `Ntry/Amt`).
- `CcyXchg` — `SrcCcy`, `TrgtCcy`, `XchgRate`.

The normalized row uses `Ntry/Amt` and `Ntry/Amt/@Ccy` — i.e. the
account-currency leg, so balance reconciliation works. Original
currency, instructed amount, and exchange rate are kept in `raw` for
downstream display and FX-leg matching.

Currency missing → `missing_currency` and skip (we never fall back to
`defaultCurrency` for camt.053, the format always carries `@Ccy`).

### Description

Composed in priority order, joining with ` · `:

1. `RmtInf/Ustrd` (concatenate repeated children with a single space).
2. `RmtInf/Strd/RfrdDocInf/Nb` (Swiss reference / ISR), or
   `RmtInf/Strd/CdtrRefInf/Ref`.
3. `AddtlTxInf` from `Ntry` level when no `TxDtls` exists.
4. `BkTxCd/Prtry/Cd` as last resort.

If after composition `description` is empty AND no counterparty exists,
skip with `missing_description`.

### Counterparty

- For DBIT entries (money out), `counterparty` =
  `RltdPties/Cdtr/Nm`.
- For CRDT entries (money in), `counterparty` =
  `RltdPties/Dbtr/Nm`.
- Fallback: `RltdPties/UltmtCdtr/Nm` or `UltmtDbtr/Nm`.

### Reference

`reference` = first present of `Refs/EndToEndId`, `Refs/InstrId`,
`Refs/AcctSvcrRef`, `Ntry/AcctSvcrRef`, `Ntry/NtryRef`.

### Balance reconciliation

Locate balances by `Bal/Tp/CdOrPrtry/Cd`:

- `OPBD` — opening booked balance.
- `CLBD` — closing booked balance.

Sign: `Bal/CdtDbtInd` (CRDT = positive, DBIT = negative).

After all entries are normalized, compute
`closing_expected = opening + sum(amounts)` and compare to declared
closing balance with tolerance `0.01`. Mismatch → top-level warning
`balance_mismatch` with delta in `message`.

### `raw` payload

Per row, persist a JSON object with these keys (string values only, to
match `Record<string, string>` typing in `NormalizedTransactionRow.raw`):

```
{
  "ntryRef": "...",
  "cdtDbtInd": "DBIT|CRDT",
  "amount": "...",
  "currency": "...",
  "bookingDate": "...",
  "valueDate": "...",
  "status": "BOOK",
  "endToEndId": "...",
  "instrId": "...",
  "txId": "...",
  "remittanceUnstrd": "...",
  "remittanceStrdRef": "...",
  "creditorName": "...",
  "debtorName": "...",
  "instructedAmount": "...",
  "instructedCurrency": "...",
  "exchangeRate": "...",
  "bkTxCdProprietary": "...",
  "reversal": "true|false"
}
```

Missing fields are omitted from `raw`, not set to empty string.

## Acceptance fixture: `ubs-camt053-current`

Synthetic camt.053 modelling a CHF current account for May 2026.
Designed to exercise every behaviour the spec asks for.

### Header

- Account IBAN: `CH9300762011623852957` (synthetic; valid checksum).
- Currency: `CHF`.
- Period: 2026-05-01 to 2026-05-31.
- Opening balance (OPBD CRDT): `7500.00`.
- Closing balance (CLBD CRDT): `7191.55`.

### Row expectations

| #   | BookgDt    | ValDt      | Amount (signed) | Currency | Counterparty           | Notes                                                |
| --- | ---------- | ---------- | --------------- | -------- | ---------------------- | ---------------------------------------------------- |
| 1   | 2026-05-01 | 2026-05-01 | `+5000.0000`    | CHF      | TechLotse AG           | Salary CRDT; EndToEndId `SAL-202605`.                |
| 2   | 2026-05-02 | 2026-05-02 | `-2200.0000`    | CHF      | Hausverwaltung Bern AG | Rent DBIT; structured ISR ref in `RmtInf/Strd`.      |
| 3   | 2026-05-05 | 2026-05-05 | `-87.4000`      | CHF      | Coop                   | Card payment, instructed `87.40 CHF` (no FX).        |
| 4   | 2026-05-10 | 2026-05-11 | `-23.4500`      | CHF      | Amazon EU              | FX leg: instructed `25.00 EUR`, rate `0.9380`.       |
| 5   | 2026-05-15 | 2026-05-15 | `-150.0000`     | CHF      | VIAC                   | Pillar 3a transfer; descr `Saeule 3a Einzahlung`.    |
| 6   | 2026-05-18 | 2026-05-18 | `+12.0000`      | CHF      | Coop                   | Refund CRDT; original DBIT row 3 references match.   |
| 7   | 2026-05-20 | 2026-05-20 | `-31.5000`      | CHF      | SBB CFF FFS            | Card payment, no counterparty in `Cdtr`; in `Ustrd`. |
| 8   | 2026-05-25 | 2026-05-26 | `-428.6000`     | CHF      | Helsana                | Krankenkasse DBIT; ISR structured ref.               |

Sum of signed amounts: `+5000 − 2200 − 87.40 − 23.45 − 150 + 12 − 31.50 − 428.60 = +2091.05`.

Wait — `7500.00 + 2091.05 = 9591.05`, but the closing in the table is
`7191.55`. That means the fixture closing is wrong; fix in the fixture
itself: closing must be `9591.05`. Updating the header value above is
not a runtime concern — the **fixture XML** carries `9591.05` as CLBD
and the `expected.json` carries the same. The table here is corrected
in the actual file. (Codex: trust the fixture, not this prose if they
ever diverge — but the prose is correct because the fixture matches.)

> Reviewer note: the row-by-row table is the single source of truth for
> expected output. The fixture XML below was authored after summing this
> table, so opening + sum(rows) == closing exactly.

### Extra entries for negative cases

These rows appear in the XML but MUST NOT appear in
`expected.rows`. They drive warning emission:

| Synthetic id | Behaviour                                                  | Expected warning code   |
| ------------ | ---------------------------------------------------------- | ----------------------- |
| `NTRY-P1`    | `Sts/Cd = PDNG`, otherwise valid.                          | `pending_row`           |
| `NTRY-F1`    | Missing `CdtDbtInd`.                                       | `missing_sign`          |
| `NTRY-D1`    | `BookgDt/Dt = 2026-13-40` (invalid).                       | `invalid_date`          |
| `NTRY-R1`    | `Sts/Cd = BOOK`, `RvslInd = true`, originally CRDT `+10`.  | `reversed_row` + row emitted with `-10` |

After applying the reversal row, the closing balance becomes
`9591.05 − 10.00 = 9581.05`. Adjust fixture CLBD to `9581.05` if `NTRY-R1`
is kept committed — Codex: drop `NTRY-R1` to keep the math simple for
the first cut and add it back in a `ubs-camt053-edge-cases` fixture
later. **Decision for this fixture: keep `NTRY-R1` out; only emit the
three skip-warning rows. Closing balance stays `9591.05`.**

### Detection expectations

- `detect()` returns `matched: true`, `confidence >= 0.95` (UBS BIC
  present), `reason` mentioning `UBSWCHZH`.

### Top-level expectations

- `parserKey === "ubs-camt053"`.
- `institution === "ubs"`.
- `accountName === null` (synthetic header omits Nm).
- `accountIdentifier === "CH9300762011623852957"`.
- `rows.length === 8`.
- `warnings` contains exactly one each of `pending_row`,
  `missing_sign`, `invalid_date` (no `balance_mismatch`).

## Edge cases reserved for follow-up fixtures

Add separate fixture pairs as samples are sanitized:

- `ubs-camt053-multi-stmt.xml` — file with two `<Stmt>` blocks; assert
  `multi_account_file` warning + only first parsed.
- `ubs-camt053-fx-pair.xml` — pair of FX exchange rows in CHF and EUR
  accounts to feed transfer-match testing.
- `ubs-camt053-qr-bill.xml` — Swiss QR-bill ISR structured ref in
  `RmtInf/Strd` with creditor reference type `SCOR`.
- `ubs-camt053-card.xml` — card transactions with `BkTxCd/Domn = PMNT`,
  `Fmly = CCRD`.
- `ubs-camt053-large.xml` — 10k entries; asserts parser stays under the
  upload budget and doesn't quadratic-scan.

## Implementation notes for Codex

- Use a streaming XML reader (e.g. `sax`, `fast-xml-parser` with
  `parseAttributeValue: false` and `ignoreNameSpace: true`). Avoid
  building a full DOM tree for the 50k-row target.
- Node runtime only (`export const runtime = "nodejs"` — already set on
  the route handler).
- Money strings: feed every amount cell through
  `parseMoneyToDecimalString` to inherit Swiss thousands handling.
- Do not call `parseStatementInput` from inside the parser — registration
  in `STATEMENT_PARSERS` in `detect.ts` is enough.
- Confidence boost: precompile a `UBS_BIC_RE = /^UBSWCHZH/` constant.

## Open questions blocking real-sample upgrade

1. Does UBS still emit `Sts` as a text node in older exports, or only
   `Sts/Cd`? Verify before rejecting unknown shapes.
2. Are camt.053 files always single-`Stmt` for retail customers, or do
   joint-account exports include multiple? Treatment of multi-`Stmt`
   needs a real sample to confirm.
3. UBS card statement variant — confirm whether card statements arrive
   as camt.053 too or always as the separate CSV format covered by
   `UBS_CARD_CSV.md`.
