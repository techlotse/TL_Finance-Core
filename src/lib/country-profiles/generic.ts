import type { CountryProfile } from "./types";

// Jurisdiction-neutral fallback. Keeps internal-transfer/FX detection (which is
// universal) but only a thin merchant ruleset so no Swiss assumptions leak.
export const genericProfile: CountryProfile = {
  key: "generic",
  label: "Generic",
  baseCurrency: "CHF",
  reviewCategory: "Other",
  internalSignals: [
    { kind: "transfer", reason: "Transfer to/from Revolut", patterns: [/revolut/i] },
    { kind: "settlement", reason: "Card settlement", patterns: [/card\s*center/i, /transfer from account/i, /direct debit/i] },
    { kind: "fx", reason: "Currency exchange", patterns: [/exchanged to/i] },
    { kind: "transfer", reason: "Internal pocket / round-up", patterns: [/to pocket/i, /pocket withdrawal/i, /revpoints/i, /spare change/i] }
  ],
  brancheMap: {},
  merchantRules: [
    { category: "Groceries", patterns: [/supermarket/i, /grocery/i, /\bcoop\b/i, /migros/i, /woolworths/i, /checkers/i, /pick n pay/i] },
    { category: "Restaurants", patterns: [/restaurant/i, /\bcafe\b/i, /coffee/i, /mcdonald/i, /\bkfc\b/i] },
    { category: "Utilities", patterns: [/energie/i, /electric/i, /\bgas\b/i, /water/i] },
    { category: "Internet", patterns: [/telecom/i, /mobile/i, /internet/i, /fibre/i] }
  ]
};
