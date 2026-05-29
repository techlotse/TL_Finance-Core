# Categorization rule seeds

Seed rules for `TransactionCategoryRule` populated at household
onboarding via the country profile selected. These are the literal
patterns the country-profile module emits — see
[`COUNTRY_PROFILES.md`](./COUNTRY_PROFILES.md) for the wrapping
contract.

Matching semantics:

- `pattern` is lowercase.
- Compared against `row.normalizedMerchantKey` first, then `description`
  lower-cased, then `counterparty` lower-cased.
- `matchType`:
  - `contains` — substring.
  - `exact` — full match after `normalizeText`.
  - `starts_with` — prefix.
- On collision (multiple rules match same row), highest `priority`
  wins; ties broken by longer pattern, then alphabetical.

All patterns below are documented with the category name and group
from `src/lib/category-presets.ts`. Categories referenced but not
present in the household's preset (because the user picked a different
preset) are dropped silently.

---

## Generic profile (always applied)

| Pattern                | matchType    | categoryName       | groupName       | Priority | Rationale                                  |
| ---------------------- | ------------ | ------------------ | --------------- | -------- | ------------------------------------------ |
| `netflix`              | contains     | Subscriptions      | Personal        | 200      | Streaming subscription marker.             |
| `spotify`              | contains     | Subscriptions      | Personal        | 200      |                                            |
| `apple.com/bill`       | contains     | Subscriptions      | Personal        | 220      | Apple combined billing.                    |
| `apple services`       | contains     | Subscriptions      | Personal        | 200      |                                            |
| `google play`          | contains     | Subscriptions      | Personal        | 200      |                                            |
| `google one`           | contains     | Subscriptions      | Personal        | 200      |                                            |
| `youtube premium`      | contains     | Subscriptions      | Personal        | 200      |                                            |
| `disney`               | contains     | Subscriptions      | Personal        | 200      |                                            |
| `airbnb`               | contains     | Lodging            | Travel          | 200      |                                            |
| `booking.com`          | contains     | Lodging            | Travel          | 200      |                                            |
| `hotels.com`           | contains     | Lodging            | Travel          | 200      |                                            |
| `expedia`              | contains     | Lodging            | Travel          | 200      |                                            |
| `uber`                 | contains     | Transport          | Transport       | 180      |                                            |
| `lyft`                 | contains     | Transport          | Transport       | 180      |                                            |
| `bolt`                 | contains     | Transport          | Transport       | 160      | Bolt + others matching — see edge note.    |
| `interest`             | contains     | Interest           | Income          | 150      | Inflow rows carrying "interest".           |
| `salary`               | contains     | Salary Person 1    | Income          | 100      | Lower priority so locale-specific salary rules can override. |
| `payroll`              | contains     | Salary Person 1    | Income          | 100      |                                            |
| `refund`               | contains     | Reimbursements     | Income          | 90       | Inflow with "refund" keyword.              |
| `fee`                  | contains     | Bank charges       | Banking         | 80       | Used by fee-split sibling rows.            |
| `bank charge`          | contains     | Bank charges       | Banking         | 90       |                                            |
| `atm`                  | contains     | Cash withdrawals   | Banking         | 80       | Generic ATM identifier.                    |

Edge note for `bolt`: pattern is short; matched by description
substring including obviously unrelated words ("bolt food"). Codex:
consider replacing with two more-specific patterns at
implementation time — `bolt food` (eats) → Restaurants, `bolt ride`
→ Transport. Update this table when narrowed.

---

## Swiss profile

### Groceries (group "Food and household" / category "Groceries")

| Pattern              | matchType | Priority | Rationale                            |
| -------------------- | --------- | -------- | ------------------------------------ |
| `coop`               | contains  | 250      | Coop card payments.                  |
| `migros`             | contains  | 250      |                                      |
| `denner`             | contains  | 240      |                                      |
| `aldi suisse`        | contains  | 240      |                                      |
| `lidl schweiz`       | contains  | 240      |                                      |
| `lidl`               | contains  | 220      | Lower than `lidl schweiz`.           |
| `manor food`         | contains  | 230      | Avoid catching `manor` clothing.     |
| `volg`               | contains  | 220      |                                      |
| `spar`               | contains  | 220      |                                      |
| `farmy`              | contains  | 220      |                                      |

### Public transport (group "Transport" / category "Public transport")

| Pattern              | matchType | Priority | Rationale                            |
| -------------------- | --------- | -------- | ------------------------------------ |
| `sbb cff ffs`        | contains  | 280      | Combined Swiss federal railways.     |
| `sbb`                | contains  | 250      |                                      |
| `cff`                | contains  | 220      | French abbreviation.                 |
| `ffs`                | contains  | 220      | Italian abbreviation.                |
| `zvv`                | contains  | 240      | Zurich transit.                      |
| `bvb`                | contains  | 220      | Basel transit.                       |
| `bls`                | contains  | 220      | Bern–Lötschberg–Simplon.             |
| `postauto`           | contains  | 220      |                                      |

### Telecom (group "Personal" / category "Telecom")

| Pattern              | matchType | Priority | Rationale                            |
| -------------------- | --------- | -------- | ------------------------------------ |
| `sunrise`            | contains  | 240      |                                      |
| `salt mobile`        | contains  | 240      |                                      |
| `salt`               | contains  | 200      | Lower priority — collides with food. |
| `swisscom`           | contains  | 240      |                                      |
| `wingo`              | contains  | 220      |                                      |
| `yallo`              | contains  | 220      |                                      |

### Health insurance basic (group "Insurance" / category "Health insurance basic")

| Pattern              | matchType | Priority | Rationale                            |
| -------------------- | --------- | -------- | ------------------------------------ |
| `helsana`            | contains  | 260      |                                      |
| `css versicherung`   | contains  | 260      |                                      |
| `css `               | starts_with | 240    | Avoid catching arbitrary `css`.      |
| `sanitas`            | contains  | 240      |                                      |
| `concordia`          | contains  | 240      |                                      |
| `visana`             | contains  | 240      |                                      |
| `swica`              | contains  | 240      |                                      |
| `assura`             | contains  | 240      |                                      |
| `groupe mutuel`      | contains  | 240      |                                      |
| `krankenkasse`       | contains  | 200      | German keyword.                      |
| `praemie grundversicherung` | contains | 240 | Premium for basic insurance.         |
| `praemie kvg`        | contains  | 240      | KVG = basic insurance law.           |

### Health insurance supplementary

| Pattern                          | matchType | Priority |
| -------------------------------- | --------- | -------- |
| `praemie zusatzversicherung`     | contains  | 240      |
| `praemie vvg`                    | contains  | 240      |
| `zusatzversicherung`             | contains  | 220      |

### Pillar 3a (group "Savings" / category "Pillar 3a")

| Pattern              | matchType | Priority | Rationale                            |
| -------------------- | --------- | -------- | ------------------------------------ |
| `saeule 3a`          | contains  | 280      |                                      |
| `säule 3a`           | contains  | 280      |                                      |
| `pillar 3a`          | contains  | 280      |                                      |
| `viac`               | contains  | 260      | Pillar 3a provider.                  |
| `frankly`            | contains  | 260      |                                      |
| `truewealth 3a`      | contains  | 260      |                                      |
| `selma 3a`           | contains  | 260      |                                      |
| `postfinance 3a`     | contains  | 260      |                                      |

### Taxes

| Pattern              | matchType | Priority | categoryName        |
| -------------------- | --------- | -------- | ------------------- |
| `quellensteuer`      | contains  | 260      | Quellensteuer       |
| `staatssteuer`       | contains  | 240      | Cantonal tax        |
| `kantonssteuer`      | contains  | 240      | Cantonal tax        |
| `bundessteuer`       | contains  | 240      | Federal tax         |
| `gemeindesteuer`     | contains  | 240      | Municipal tax       |
| `steuerverwaltung`   | contains  | 220      | Tax prepayment      |
| `steueramt`          | contains  | 220      | Tax prepayment      |

### Housing

| Pattern                       | matchType | Priority | categoryName |
| ----------------------------- | --------- | -------- | ------------ |
| `nebenkosten`                 | contains  | 260      | Nebenkosten  |
| `mietzins`                    | contains  | 260      | Rent         |
| `miete`                       | contains  | 220      | Rent         |
| `hausverwaltung`              | contains  | 240      | Rent         |
| `liegenschaftsverwaltung`     | contains  | 240      | Rent         |
| `serafe`                      | contains  | 260      | Serafe       |
| `ewz`                         | contains  | 240      | Electricity  |
| `bkw`                         | contains  | 240      | Electricity  |
| `iwb`                         | contains  | 240      | Electricity  |
| `axpo`                        | contains  | 240      | Electricity  |

### Salary (Swiss)

| Pattern              | matchType | Priority | categoryName    | Rationale                                  |
| -------------------- | --------- | -------- | --------------- | ------------------------------------------ |
| `salary`             | contains  | 150      | Salary Person 1 | Higher than generic so it wins on tie.     |
| `gehalt`             | contains  | 150      | Salary Person 1 |                                            |
| `lohn`               | contains  | 150      | Salary Person 1 |                                            |
| `salaire`            | contains  | 150      | Salary Person 1 |                                            |

### Child allowance

| Pattern              | matchType | Priority | categoryName    |
| -------------------- | --------- | -------- | --------------- |
| `kinderzulage`       | contains  | 200      | Child allowance |
| `familienzulage`     | contains  | 200      | Child allowance |
| `allocation famille` | contains  | 200      | Child allowance |

---

## South Africa profile

### Groceries (group "Food and household" / category "Groceries")

| Pattern               | matchType | Priority |
| --------------------- | --------- | -------- |
| `pick n pay`          | contains  | 260      |
| `pnp`                 | contains  | 200      |
| `checkers`            | contains  | 260      |
| `shoprite`            | contains  | 260      |
| `woolworths`          | contains  | 260      |
| `spar`                | contains  | 240      |
| `food lover`          | contains  | 240      |
| `food lover's market` | contains  | 260      |

### Fuel

| Pattern    | matchType | Priority | categoryName    |
| ---------- | --------- | -------- | --------------- |
| `engen`    | contains  | 240      | Fuel            |
| `sasol`    | contains  | 240      | Fuel            |
| `bp `      | starts_with | 220    | Fuel            |
| `caltex`   | contains  | 240      | Fuel            |
| `total`    | contains  | 200      | Fuel            |

### Telecom

| Pattern   | matchType | Priority | categoryName |
| --------- | --------- | -------- | ------------ |
| `mtn`     | contains  | 240      | Telecom      |
| `vodacom` | contains  | 240      | Telecom      |
| `cell c`  | contains  | 240      | Telecom      |
| `rain`    | contains  | 200      | Telecom      |
| `telkom`  | contains  | 240      | Telecom      |

### Utilities

| Pattern                | matchType | Priority | categoryName     |
| ---------------------- | --------- | -------- | ---------------- |
| `eskom`                | contains  | 260      | Electricity      |
| `city of joburg`       | contains  | 240      | Municipal rates  |
| `city of cape town`    | contains  | 240      | Municipal rates  |
| `ethekwini`            | contains  | 240      | Municipal rates  |
| `prepaid electricity`  | contains  | 220      | Electricity      |

### Medical aid

| Pattern                 | matchType | Priority | categoryName  |
| ----------------------- | --------- | -------- | ------------- |
| `discovery health`      | contains  | 260      | Medical aid   |
| `momentum health`       | contains  | 260      | Medical aid   |
| `bonitas`               | contains  | 260      | Medical aid   |
| `fedhealth`             | contains  | 260      | Medical aid   |
| `bestmed`               | contains  | 260      | Medical aid   |
| `profmed`               | contains  | 260      | Medical aid   |
| `medical aid`           | contains  | 200      | Medical aid   |

### Insurance

| Pattern         | matchType | Priority | categoryName        |
| --------------- | --------- | -------- | ------------------- |
| `outsurance`    | contains  | 240      | Vehicle insurance   |
| `miway`         | contains  | 240      | Vehicle insurance   |
| `santam`        | contains  | 240      | Household insurance |
| `old mutual`    | contains  | 200      | Life insurance      |
| `sanlam`        | contains  | 200      | Life insurance      |
| `momentum life` | contains  | 200      | Life insurance      |
| `liberty`       | contains  | 180      | Life insurance      |

### Tax / SARS

| Pattern         | matchType | Priority | categoryName    |
| --------------- | --------- | -------- | --------------- |
| `sars`          | contains  | 280      | Tax prepayment  |
| `paye`          | contains  | 260      | Tax prepayment  |
| `uif`           | contains  | 260      | Social security |
| `it12`          | contains  | 220      | Tax prepayment  |
| `it34`          | contains  | 220      | Tax prepayment  |
| `irp5`          | contains  | 220      | Tax prepayment  |

### Retirement

| Pattern               | matchType | Priority | categoryName      |
| --------------------- | --------- | -------- | ----------------- |
| `retirement annuity`  | contains  | 260      | Retirement annuity |
| `ra contribution`     | contains  | 260      | Retirement annuity |
| `pension fund`        | contains  | 240      | Pension           |
| `provident fund`      | contains  | 240      | Provident fund    |

### Salary

| Pattern               | matchType | Priority | categoryName    |
| --------------------- | --------- | -------- | --------------- |
| `salary`              | contains  | 150      | Salary Person 1 |
| `payroll`             | contains  | 150      | Salary Person 1 |

### Housing

| Pattern   | matchType | Priority | categoryName |
| --------- | --------- | -------- | ------------ |
| `bond`    | contains  | 220      | Mortgage     |
| `levies`  | contains  | 220      | Levies       |
| `rates`   | contains  | 200      | Municipal rates |

---

## Conflict examples (intentional, documented)

| Row description                             | Wins         | Why                                            |
| ------------------------------------------- | ------------ | ---------------------------------------------- |
| `salt mobile abo`                           | Telecom      | `salt mobile` priority 240 > `salt` 200.       |
| `salt bay restaurant zurich`                | (no match)   | `salt mobile` doesn't match; bare `salt` wins via priority 200 but Codex MUST verify — if false positives observed, drop bare `salt`. |
| `manor food bahnhofstrasse`                 | Groceries    | `manor food` priority 230.                     |
| `manor`                                     | (no match)   | No `manor`-only rule — intentionally avoid mis-categorizing the department store as groceries. |
| `lidl berlin`                               | Groceries    | `lidl` matches generic CH preset (priority 220). Note this misfires on a non-Swiss Lidl; SA / generic profile cover it via SPAR/Checkers instead. |
| `viac einzahlung`                           | Pillar 3a    | `viac` priority 260 > `saeule 3a` 280; **wait** — 260 < 280, so `saeule 3a` wins if both match. Here only `viac` matches; result is Pillar 3a. |

## What Codex must verify

1. Every `categoryName`/`groupName` here exists in the matching
   preset in `src/lib/category-presets.ts`. If not (e.g. preset uses
   `Public transport` but the rules say `Transport`), normalize the
   strings in this doc to match the preset and rerun the diff. The
   generic preset currently does not have `Public transport` — Codex
   may need to add it to the preset OR drop the rule, per design call.
2. Pattern collisions on the same row produce a deterministic winner.
   Add a unit test that loads each profile and asserts the documented
   examples in the conflict table above.
3. Lowercase patterns only. Tests assert no uppercase escapes the
   profile module.
4. `pattern.length >= 3` for `contains` matches — sub-3-character
   substrings cause false positives (e.g. `bp` in `lidl bp pickup`).
   The two SA `bp ` and Swiss `css ` patterns above use trailing
   space + `starts_with` to mitigate.
