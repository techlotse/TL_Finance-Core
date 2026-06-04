# Statement Ingestion Readiness — Financial Analysis Module

- **Date:** 2026-06-04
- **Branch reviewed:** `codex/product-split-foundation`
- **Scope:** How far the current architecture supports ingesting *real* bank
  statements into the planned Financial-analysis module, measured against an
  actual household export set (UBS current/savings CSV, UBS Mastercard CSV,
  Revolut CHF/EUR/ZAR CSV, UBS key4 positions, Pillar 3a, Roche/Equatex shares,
  Koinly crypto).
- **Role boundary:** Per `PRODUCT_SPLIT_AND_STATEMENT_INGESTION.md`, this pass
  produces fixture/spec/heuristic guidance for Codex to implement. It does **not**
  redesign the schema or API surface — the foundation is sound.

---

## 1. Verdict

The **foundation is in good shape and faithful to the strategy doc**: the data
model, parser contract, normalize/dedupe helpers, idempotent preview/commit
pipeline, household scoping, and audit are all landed and correct. The schema
needs no rework.

The honest gap is **coverage, not architecture**. Today only `generic-csv` is
registered, and tested against the three formats you actually hold, **none of
them parse**:

| Your real file | Parses on current code? | Why not |
| --- | --- | --- |
| UBS account CSV (`FP/MP/RP…`) | ❌ | 8-line metadata preamble is treated as the header row; German headers (`Buchungsdatum`, `Belastung`, `Gutschrift`) aren't in the generic alias lists; no dedicated parser/spec exists at all |
| UBS Mastercard CSV (`CC`) | ❌ | `sep=;` preamble line; Latin-1 encoding mangled to UTF-8; columns differ from the synthetic fixture; `Branche` is a *category*, not the description |
| Revolut CSV (`RRC/RRE/RRZ`) | ❌ | Date columns are `Started Date`/`Completed Date` (not in generic `DATE_HEADERS`); real `Type` values are Title-Case (`Card Payment`, `Topup`, `Card Refund`, `Charge`) while the spec/fixture use `UPPER_SNAKE` |

So the realistic state is **Phase 2 complete, Phase 3 not started**: specs and
*synthetic* fixtures exist, but no dedicated parser is implemented, and the
synthetic fixtures diverge from the real exports in ways that will cause silent
misses if implemented as-is. You now have the real samples the strategy
explicitly waits for ("Build from sanitized real fixtures, not assumed bank
formats").

---

## 2. What the architecture already gives you (strengths to keep)

**Data model — fully landed and correct** (`prisma/schema.prisma`):
`StatementImport`, `ActualTransaction`, `TransactionCategoryRule`,
`TransactionTransferMatch`. `ActualTransaction` carries everything analysis
needs — `Decimal(18,4)` amount, `currency`, `balanceAfter`, `normalizedMerchantKey`,
`raw` JSON, `reviewState`, `dedupeHash` — with the right indexes and the two
idempotency uniques (`StatementImport(householdId, contentHash)` and
`ActualTransaction(householdId, dedupeHash)`). This directly supports the
money-in / money-out / across-accounts promise of the analysis tier.

**Parser contract** (`src/lib/statements/types.ts`): clean `StatementParser`
interface (`detect` + `parse`), `NormalizedStatement`/`NormalizedTransactionRow`,
structured `StatementWarning`, and a frozen `STATEMENT_PARSER_VERSION` stamped
onto every row. Fail-closed and warning-carrying by design.

**Normalize helpers** (`src/lib/statements/normalize.ts`) already handle the
Swiss specifics you need: apostrophe thousands separators (`1'234.50`),
parenthesised and trailing-minus negatives, comma/dot decimal auto-detection,
and `dd.mm.yyyy` dates — plus `normalizeMerchantKey` and the deterministic
`createTransactionDedupeHash`. These are reusable as-is by every dedicated parser.

**Pipeline wired end-to-end**:
`POST /api/statement-imports/preview` parses + audits + returns sample rows and
warnings with **no commit**; `POST /api/statement-imports` upserts the import by
`contentHash`, validates currency pockets, and writes via batched
`createMany`/dedupe inside a `$transaction` with household scoping and audit. The
preview-before-commit and idempotency guarantees are real, not aspirational.

**Discipline is right**: parser spec docs (`docs/strategy/parsers/*`), synthetic
fixtures with golden expected JSON + reconciliation assertions, review-queue
default, intent to strip internal transfers/FX before spending, and "AI only on
aggregates."

---

## 3. Reality check — your formats vs. the plan

| Format (your file) | Planned parser | Spec | Fixture | Fixture matches reality? |
| --- | --- | --- | --- | --- |
| UBS current/savings CSV (`Beschreibung1-3`, `Belastung`/`Gutschrift`, `Saldo`, 8-line preamble) | **none** | **none** | **none** | — (uncovered) |
| UBS account via ISO 20022 | `ubs-camt053` | ✅ `UBS_CAMT053.md` | ✅ synthetic XML | n/a — you don't export camt.053 today |
| UBS Mastercard CSV | `ubs-card-csv` | ✅ `UBS_CARD_CSV.md` | ✅ synthetic | ⚠️ columns + encoding differ |
| Revolut per-currency CSV | `revolut-csv` | ✅ `REVOLUT_CSV.md` | ✅ synthetic | ⚠️ `Type` casing + type set differ |
| Revolut XLSX | `revolut-xlsx` | ✅ `REVOLUT_XLSX.md` | — | n/a |
| FNB CSV | `fnb-csv` | ✅ `FNB_CSV.md` | ✅ synthetic | unknown — no real sample (your ZAR ran through Revolut, not FNB) |
| UBS key4 positions; 3a; Roche shares; crypto | **none** | **none** | **none** | holdings, not transactions — see G8 |

---

## 4. Gaps, prioritized

**G1 — Blocker · No UBS *account* CSV path.** The strategy picks camt.053 XML as
the UBS account route, but your real export — and what most UBS e-banking users
download — is the **account-transaction CSV** with the metadata preamble and
`Beschreibung1/2/3` + `Belastung/Gutschrift/Einzelbetrag/Saldo` columns. There is
no spec, fixture, or parser for it. Either (a) commit to exporting camt.053 from
UBS e-banking, or (b) add a `ubs-account-csv` parser. Given the data on hand,
(b) is the pragmatic first target.

**G2 — Blocker · Revolut `Type` mismatch.** `REVOLUT_CSV.md` and the fixture key
behaviour off `TOPUP|CARD_PAYMENT|EXCHANGE|REFUND|…`. Your real export uses
Title-Case with spaces: `Card Payment`, `Topup`, `Exchange`, `Transfer`,
`Card Refund`, `Fee`, `ATM`, `Charge`. The spec's 0.97-confidence check and the
type→behaviour routing will silently fail to match. The set also lacks
`Card Refund` and `Charge`. Fix in spec + fixture before implementation.

**G3 — High · UBS card CSV shape.** Real header is
`Kontonummer;Kartennummer;Konto-/Karteninhaber;Einkaufsdatum;Buchungstext;Branche;Betrag;Originalwährung;Kurs;Währung;Belastung;Gutschrift;Buchung`,
preceded by a `sep=;` line. The spec's alias table must add `einkaufsdatum`→date
and **treat `Buchungstext` as the description and `Branche` as a category hint**
(the spec currently says use `Branche` as description — wrong for this export,
which has both).

**G4 — High · Encoding.** `request.ts` decodes every upload as UTF-8
(`TextDecoder("utf-8", {fatal:false})`). The UBS card CSV is Latin-1/CP1252
(umlauts arrive as `Originalw�hrung`). Need charset detection or a per-parser
decode hint; the UBS account CSVs are UTF-8-BOM (already fine).

**G5 — High · Metadata preamble.** Both UBS CSVs carry header/summary lines
before the column header. Dedicated parsers must locate the column-header row
(scan for `Abschlussdatum…` / `…Belastung;Gutschrift`) rather than assuming row 0,
and should capture the preamble (IBAN, opening/closing balance, period) for the
reconciliation assertion the fixture harness already expects.

**G6 — Medium · Cross-file FX + internal-transfer matching.** Your explicit
requirement — "ignore inter-account transfers, they're just cash management" —
is exactly what `TransactionTransferMatch` is for, but `transfer-match.ts` is not
implemented. This is the single most important piece of logic for the analysis
tool's accuracy: Revolut ships one file per currency, `Exchange` legs live in
*different* files, and UBS↔Revolut top-ups, UBS↔UBS transfers, and card
settlements must be netted out before any spending summary. Section 6 gives the
ruleset derived from your data.

**G7 — Medium · Missing modules.** `category-rules.ts` and `transfer-match.ts`
(in the strategy's parser layout) and the whole `src/lib/country-profiles/`
(`swiss.ts`, `south-africa.ts`, `generic.ts`) don't exist yet. The
`TransactionCategoryRule` table has no application logic behind it.

**G8 — Medium · Holdings are out of scope of the transaction pipeline.** "Financial
analysis" for this household is ~80% net worth (key4 ≈ 16k, 3a ≈ 93k, Roche ≈
93k, crypto ≈ 29k) vs. a cash transaction ledger. The statement pipeline models
*flows*, not *positions*. Decide explicitly whether net-worth/holdings ingestion
(a) reuses existing `BankAccount`/asset/investment models via manual or snapshot
entry, or (b) gets its own `PositionSnapshot` import path later. Don't let it
leak into `ActualTransaction`.

**G9 — Low · Fixtures still synthetic.** The strategy requires ≥2 sanitized real
samples per format before a parser is production-ready. You now have them — the
next action is to lock them as fixtures (Section 5).

---

## 5. Recommended next steps (fixture-first, additive, maps to strategy phases)

1. **Lock sanitized real fixtures (Phase 3, do first).** Convert one month each
   of your UBS account CSV, UBS card CSV, and Revolut CHF/EUR/ZAR into sanitized
   `__fixtures__` pairs (mask IBANs/names/card numbers; keep structure, dates,
   signs, balances). Add the missing **`ubs-account-csv`** fixture + golden JSON.
2. **Patch the two diverging specs** before code: Revolut `Type` set/casing (G2),
   UBS card columns + `Buchungstext`/`Branche` semantics (G3).
3. **Author `UBS_ACCOUNT_CSV.md`** spec (G1): preamble capture, column-header
   detection, `Belastung/Gutschrift`→signed amount, `Beschreibung1` as
   counterparty / `Beschreibung1+2` as description, `Saldo`→`balanceAfter`,
   opening/closing reconciliation.
4. **Fix the decode path** (G4) — charset sniff or per-parser hint; add a Latin-1
   card fixture to prove umlauts survive.
5. **Implement parsers** against the locked fixtures, registering them in
   `STATEMENT_PARSERS` ahead of `generic-csv`.
6. **Implement `transfer-match.ts`** (G6) using Section 6 rules; have it set
   `reviewState`/exclusion flags so spending aggregates net out internal flows.
7. **Add `category-rules.ts` + `country-profiles/swiss.ts`** seeded from Section
   6; default unknowns to the review queue, never silent "Other".
8. **Decide the holdings boundary** (G8) and document it.

---

## 6. Real-data-derived heuristics (hand-off to the implementer)

These come from classifying the actual export set and reconcile exactly to every
UBS statement's opening/closing balance.

**Internal-transfer / exclude-before-spending rules (G6):**

- Counterparty matches a household name (`Ruan Steyn`, `Maniesh Steyn`,
  `… a/o …`, masked `XXXX XXXX XXXX`) → internal transfer.
- Description contains `REVOLUT` (UBS side) → UBS↔Revolut top-up/withdrawal.
- Description contains `UBS … Card Center` → credit-card settlement (the real
  spend is in the card file; exclude the settlement to avoid double counting).
- Revolut `Exchange`, `Topup`, pocket moves, `Revpoints/Spare change`,
  `SWIFT Transfer to <self>`, `Payment from <self>`, `Open banking top-up` →
  internal/FX; pair `Exchange` legs across the per-currency files.
- 3a standing orders (`UBS/3A/…`, `…Fisca`, account `F3003…`) and
  `Übertrag an UBS Fondskonto` / `UBS/INVEST/…` → **savings/investment**, a
  separate bucket, not spending.
- *Net effect on this dataset: ~CHF 885k of gross internal movement removed; per-account reconciliation stays exact.*

**Categorisation seeds (Swiss profile):** `Zug Estates`→Rent; `CSS/Helsana/
SWICA/Sanitas/Assura/…`→Krankenkasse/Insurance; `take best care / Krippe / Kita`
→Childcare; `Coop/Migros/Denner/Volg/Aldi/Lidl`→Groceries; `SBB/ZVV/Postauto/
Mobility`→Transport; `Swisscom/Sunrise/Salt/WWZ/Serafe`→Utilities; `Steuerverwaltung/
Finanzverwaltung`→Taxes; flying-club/`Flugplatz`/`ForeFlight`→hobby/leisure.
**Credit-card `Branche` is a ready-made category source** — map it directly
(`Lebensmittelgeschäft`→Groceries, `Transportunternehmen`→Transport, etc.) before
falling back to merchant keywords.

**Revolut type/state routing (corrected to real spellings):** emit `Card Payment`,
`ATM`, `Transfer`(to third parties), `Fee`, `Charge`, `Topup`, `Exchange`,
`Card Refund`; **skip + warn** on `PENDING` and `REVERTED` (Revolut keeps the
original row; emitting the reversal double-counts); subtract the per-row `Fee`.

**Per-parser acceptance criteria** (for golden tests): exact row count;
`opening + Σ(rows) == closing` within 0.01; sign convention
(`Belastung` negative, `Gutschrift` positive; Revolut `Amount` already signed);
fee handling; pending/reverted skipped-with-warning; FX rows emitted and paired;
card refunds positive; no silent row drops.

---

## 7. Bottom line for building out the analysis tool

You don't need to touch the schema or the API. The work is: **lock real
fixtures → correct two specs and add the UBS-account-CSV spec → fix decoding →
implement the four parsers → add transfer-matching + a Swiss category profile.**
The transfer-matching is the highest-leverage piece, because the household's
money is dominated by inter-account movement and the spending picture is
meaningless until that's netted out.

> Offer: I can generate the sanitized real `__fixtures__` (input + golden
> `expected.json`) directly from your statements, patch the Revolut/UBS-card
> specs, draft `UBS_ACCOUNT_CSV.md`, and write the `transfer-match` + Swiss-profile
> rule tables — all additive, ready for Codex to implement against.
