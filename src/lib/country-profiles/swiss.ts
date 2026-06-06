import type { CountryProfile } from "./types";

// Swiss profile. Category names map to the Swiss onboarding preset
// (src/lib/category-presets.ts). Patterns and Branche keys are written against
// DIACRITIC-STRIPPED, lower-cased text (ä->a, ö->o, ü->u) to match the classifier.
export const swissProfile: CountryProfile = {
  key: "swiss",
  label: "Switzerland",
  baseCurrency: "CHF",
  reviewCategory: "Unknown",
  internalSignals: [
    { kind: "transfer", reason: "Transfer to/from Revolut", patterns: [/revolut/i] },
    {
      kind: "settlement",
      reason: "Credit-card settlement",
      patterns: [/card\s*center/i, /kartenkonto/i, /transfer from account/i, /direct debit/i]
    },
    {
      kind: "savings",
      reason: "Pillar 3a contribution",
      patterns: [/\bfisca\b/i, /\/3a\//i, /\bf3003\d/i, /pillar\s*3a/i, /saule\s*3a/i]
    },
    {
      kind: "savings",
      reason: "Investment / fund transfer (key4)",
      patterns: [/fondskonto/i, /\/invest\//i, /key4/i]
    },
    { kind: "fx", reason: "Currency exchange", patterns: [/exchanged to/i] },
    {
      kind: "transfer",
      reason: "Internal pocket / round-up",
      patterns: [/to pocket/i, /pocket withdrawal/i, /revpoints/i, /spare change/i, /balance migration/i, /closing transaction/i]
    }
  ],
  brancheMap: {
    lebensmittelgeschaft: "Groceries",
    backerei: "Groceries",
    restaurants: "Restaurants",
    "fast-food restaurants": "Restaurants",
    transportunternehmen: "Public transport",
    eisenbahnen: "Public transport",
    tankstelle: "Fuel",
    reiseburo: "Holidays",
    hotel: "Holidays",
    flughafen: "Holidays",
    fluggesellschaft: "Holidays",
    sportgeschaft: "Sports",
    warenhaus: "Household supplies",
    "mobel- und einrichtungsgeschaft": "Household supplies",
    elektronikgeschafte: "Household supplies",
    schuhgeschaft: "Clothes",
    bekleidungsgeschaft: "Clothes",
    spielwarengeschaft: "Toys",
    "drogerie / apotheke": "Medication",
    orthopadie: "Doctor",
    "do it yourself / bau center": "Household supplies",
    freizeitangebot: "Entertainment",
    bankdienstleistungen: "Buffer"
  },
  merchantRules: [
    { category: "Rent", patterns: [/zug estates/i, /\bmiete\b/i, /immobilien/i] },
    { category: "Kita", patterns: [/take best care/i, /kinderkrippe/i, /\bkrippe\b/i, /\bkita\b/i, /kinderbetreuung/i, /spielgruppe/i, /kleine schwimmer/i, /tagesfamilie/i] },
    { category: "Health insurance basic", patterns: [/\bcss\b/i, /krankenvers/i, /krankenkasse/i, /helsana/i, /swica/i, /sanitas/i, /assura/i, /concordia/i, /sympany/i, /visana/i, /groupe mutuel/i] },
    { category: "Car insurance", patterns: [/outsurance/i, /allianz/i, /baloise/i, /die mobiliar/i, /generali/i, /zurich vers/i] },
    { category: "Hobbies", patterns: [/flying club/i, /flugplatz/i, /flugschule/i, /motorflug/i, /segelflug/i, /air-?club/i, /aero ?club/i, /foreflight/i, /trainingpeaks/i, /aviation/i, /zivilluftfahrt/i, /jet-?stream/i] },
    { category: "Electricity", patterns: [/\bwwz\b/i, /\bewz\b/i, /\bckw\b/i, /energie/i, /elektrizit/i] },
    { category: "Serafe", patterns: [/serafe/i, /billag/i] },
    { category: "Internet", patterns: [/swisscom/i, /sunrise/i, /\bsalt\b/i, /\bupc\b/i, /wingo/i, /yallo/i] },
    { category: "Cantonal tax", patterns: [/steuerverwalt/i, /steueramt/i, /finanzverwalt/i, /\bsteuer\b/i, /\bsars\b/i] },
    { category: "Public transport", patterns: [/\bsbb\b/i, /easyride/i, /\bvbz\b/i, /\bzvv\b/i, /postauto/i, /\bbvb\b/i, /zugerland/i] },
    { category: "Fuel", patterns: [/tankstelle/i, /migrol/i, /socar/i, /\bavia\b/i, /\bshell\b/i, /\bengen\b/i] },
    { category: "Parking", patterns: [/parkhaus/i, /parking/i] },
    { category: "Groceries", patterns: [/\bcoop\b/i, /migros/i, /migrolino/i, /denner/i, /\baldi\b/i, /\blidl\b/i, /\bspar\b/i, /\bvolg\b/i, /alnatura/i, /metzgerei/i, /backerei/i, /von rotz/i, /woolworths/i, /pick n pay/i, /checkers/i, /hello ?fresh/i] },
    { category: "Restaurants", patterns: [/restaurant/i, /\bkfc\b/i, /mcdonald/i, /burger/i, /kebab/i, /pizza/i, /bistro/i, /imbiss/i, /brauerei/i, /\bpub\b/i] },
    { category: "Coffee", patterns: [/\bkaffee\b/i, /starbucks/i, /\bcafe\b/i, /elvetino/i] },
    { category: "Household supplies", patterns: [/galaxus/i, /digitec/i, /\bikea\b/i, /interio/i, /micasa/i, /manor/i, /globus/i, /media markt/i, /interdiscount/i, /melectronics/i, /hornbach/i, /\bobi\b/i, /jumbo/i, /bauhaus/i] },
    { category: "Clothes", patterns: [/zalando/i, /\bh&m\b/i, /\bc&a\b/i, /\bzara\b/i, /uniqlo/i, /dosenbach/i, /ochsner/i, /\bschuh/i, /bekleidung/i, /tiffosi/i] },
    { category: "Doctor", patterns: [/dr\.\s*med/i, /\bspital\b/i, /klinik/i, /permanence/i, /medbase/i, /hausarzt/i] },
    { category: "Dentist", patterns: [/\bdent/i, /zahnarzt/i] },
    { category: "Medication", patterns: [/apotheke/i, /pharmaci/i, /drogerie/i] },
    { category: "Software subscriptions", patterns: [/google/i, /microsoft/i, /adobe/i, /openai/i, /chatgpt/i, /anthropic/i, /\bclaude\b/i, /github/i, /hostpoint/i, /linkedin/i, /\bicloud\b/i] },
    { category: "Streaming", patterns: [/netflix/i, /spotify/i, /disney/i, /youtube/i] },
    { category: "Mobile phone", patterns: [/\bmtn\b/i, /vodacom/i] },
    { category: "Sports", patterns: [/fitness/i, /\bgym\b/i, /decathlon/i, /\bstrava\b/i, /schwimmbad/i] },
    { category: "Entertainment", patterns: [/\bkino\b/i, /cinema/i, /museum/i, /theater/i, /konzert/i, /ludothek/i] },
    { category: "Holidays", patterns: [/\bhotel/i, /novotel/i, /marriott/i, /booking\.com/i, /airbnb/i, /lufthansa/i, /edelweiss/i, /easyjet/i, /ryanair/i, /\bcondor\b/i, /\bflug\b/i, /airport/i, /flughafen/i, /reiseburo/i, /guesthouse/i, /\blodge\b/i, /expedia/i] },
    { category: "Toys", patterns: [/spielwaren/i, /\btoys\b/i, /lego/i] }
  ]
};
