# Statement parser fixtures

Synthetic statement files plus their golden expected outputs. Each
parser ships at least one pair:

- `<key>-<scenario>.<ext>` — synthetic statement, hand-authored to match
  the spec in `docs/strategy/parsers/`.
- `<key>-<scenario>.expected.json` — the `NormalizedStatement` the
  parser must produce, plus `meta` describing what the fixture covers.

All fixtures here are **synthetic** — built only from public format
specifications. They are placeholders until sanitized real bank samples
arrive. Do not treat numeric details as authoritative real-world
distributions; they exist only to exercise parser behaviour.

## File header convention

Every fixture file begins with a comment block declaring:

```
PROVENANCE: synthetic
SOURCE-SPEC: <link or doc title>
COVERS: <one-line scenario summary>
NORMALIZED-BY: docs/strategy/parsers/<SPEC>.md
```

For XML/CSV, the block is a `<!-- -->` or leading `#` comment. For
formats that disallow comments (XLSX, strict CSV consumers), the
provenance goes in the matching `.expected.json` `meta.provenance`
field and a sibling `<file>.PROVENANCE.txt` is committed alongside.

## Expected-JSON shape

```
{
  "meta": {
    "provenance": "synthetic",
    "spec": "docs/strategy/parsers/UBS_CAMT053.md",
    "covers": "single-Stmt CHF account with FX, Pillar 3a, ISR, refund"
  },
  "detection": {
    "matched": true,
    "minConfidence": 0.95,
    "reasonContains": "UBSWCHZH"
  },
  "statement": {
    "parserKey": "ubs-camt053",
    "parserVersion": "0.1.0",
    "institution": "ubs",
    "accountName": null,
    "accountIdentifier": "CH9300762011623852957",
    "rows": [ ... NormalizedTransactionRow ... ],
    "warnings": [ ... StatementWarning ... ]
  },
  "balances": {
    "opening": "7500.0000",
    "closing": "9591.0500",
    "currency": "CHF"
  }
}
```

`parserVersion` must equal `STATEMENT_PARSER_VERSION`. If that constant
bumps, every expected JSON must bump with it in the same commit.

## How parsers run against these

The test file for each parser (e.g. `src/lib/statements/ubs-camt053.test.ts`)
loads the input fixture, runs `parseStatementInput`, and asserts:

1. `detect(input).confidence >= meta.detection.minConfidence` and
   `detect(input).reason.includes(meta.detection.reasonContains)`.
2. The parsed statement equals `meta.statement` deep-equal except for
   `raw` payloads, which are checked field-by-field per spec.
3. The reconciliation `opening + sum(rows) === closing` (within
   `0.01` tolerance).
4. `warnings` matches `meta.statement.warnings` by `code` + `rowNumber`
   set.
