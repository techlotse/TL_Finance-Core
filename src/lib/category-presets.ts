import { CategoryType } from "@prisma/client";

/**
 * Category presets used by the onboarding wizard and the dev seed script.
 * Each preset is a list of groups; each group has a default CategoryType
 * applied to all its categories (matching the legacy seed behaviour).
 *
 * Swiss is the most opinionated preset — it carries Swiss-specific terms
 * like Nebenkosten, Kita, Pillar 3a, Quellensteuer that wouldn't make sense
 * elsewhere. Generic is the universal fallback. German and French presets
 * fall back to Generic for now; localised versions can be added later
 * without changing the wizard or the API contract.
 */

export type CategoryPreset = "swiss" | "german" | "french" | "generic";

export interface CategoryGroupPreset {
  name: string;
  type: CategoryType;
  categories: string[];
}

const SWISS: CategoryGroupPreset[] = [
  {
    name: "Income",
    type: CategoryType.income,
    categories: [
      "Salary Person 1",
      "Salary Person 2",
      "Bonus",
      "Child allowance",
      "Reimbursements",
      "Other income"
    ]
  },
  {
    name: "Housing",
    type: CategoryType.expense,
    categories: [
      "Rent",
      "Mortgage",
      "Nebenkosten",
      "Electricity",
      "Heating",
      "Water",
      "Internet",
      "Serafe",
      "Household insurance"
    ]
  },
  {
    name: "Insurance",
    type: CategoryType.expense,
    categories: [
      "Health insurance basic",
      "Health insurance supplementary",
      "Accident insurance",
      "Liability insurance",
      "Legal insurance",
      "Car insurance",
      "Life insurance"
    ]
  },
  {
    name: "Taxes",
    type: CategoryType.expense,
    categories: [
      "Federal tax",
      "Cantonal tax",
      "Municipal tax",
      "Wealth tax",
      "Quellensteuer",
      "Tax prepayment"
    ]
  },
  {
    name: "Childcare and family",
    type: CategoryType.expense,
    categories: [
      "Kita",
      "School",
      "Activities",
      "Clothes",
      "Toys",
      "Medical child expenses"
    ]
  },
  {
    name: "Food and household",
    type: CategoryType.expense,
    categories: [
      "Groceries",
      "Restaurants",
      "Coffee",
      "Household supplies",
      "Cleaning supplies"
    ]
  },
  {
    name: "Transport",
    type: CategoryType.expense,
    categories: [
      "Public transport",
      "Car lease or loan",
      "Fuel",
      "EV charging",
      "Parking",
      "Maintenance",
      "Road tax",
      "Vignette"
    ]
  },
  {
    name: "Savings and investments",
    type: CategoryType.investment,
    categories: [
      "Emergency fund",
      "Pillar 3a",
      "ETF investments",
      "Brokerage contribution",
      "Savings account",
      "Child savings"
    ]
  },
  {
    name: "Subscriptions and services",
    type: CategoryType.expense,
    categories: [
      "Mobile phone",
      "Streaming",
      "Cloud services",
      "Software subscriptions",
      "Gym",
      "News and media"
    ]
  },
  {
    name: "Healthcare",
    type: CategoryType.expense,
    categories: [
      "Doctor",
      "Dentist",
      "Medication",
      "Franchise and Selbstbehalt",
      "Glasses and lenses"
    ]
  },
  {
    name: "Leisure and travel",
    type: CategoryType.expense,
    categories: [
      "Holidays",
      "Weekend trips",
      "Hobbies",
      "Sports",
      "Gifts",
      "Entertainment"
    ]
  },
  {
    name: "Miscellaneous",
    type: CategoryType.expense,
    categories: ["Buffer", "Cash withdrawal", "Unknown", "Other"]
  }
];

const GENERIC: CategoryGroupPreset[] = [
  {
    name: "Income",
    type: CategoryType.income,
    categories: [
      "Primary salary",
      "Secondary salary",
      "Bonus",
      "Reimbursements",
      "Other income"
    ]
  },
  {
    name: "Housing",
    type: CategoryType.expense,
    categories: [
      "Rent or mortgage",
      "Utilities",
      "Internet",
      "Home insurance",
      "Maintenance"
    ]
  },
  {
    name: "Insurance",
    type: CategoryType.expense,
    categories: [
      "Health insurance",
      "Liability insurance",
      "Car insurance",
      "Life insurance"
    ]
  },
  {
    name: "Taxes",
    type: CategoryType.expense,
    categories: ["Income tax", "Wealth or property tax", "Tax prepayment"]
  },
  {
    name: "Family and childcare",
    type: CategoryType.expense,
    categories: ["Childcare", "School", "Activities", "Clothes", "Medical care"]
  },
  {
    name: "Food and household",
    type: CategoryType.expense,
    categories: ["Groceries", "Restaurants", "Household supplies"]
  },
  {
    name: "Transport",
    type: CategoryType.expense,
    categories: ["Public transport", "Fuel or charging", "Maintenance", "Parking"]
  },
  {
    name: "Savings and investments",
    type: CategoryType.investment,
    categories: [
      "Emergency fund",
      "Retirement",
      "Investments",
      "Savings account"
    ]
  },
  {
    name: "Subscriptions",
    type: CategoryType.expense,
    categories: ["Mobile phone", "Streaming", "Software", "Gym"]
  },
  {
    name: "Healthcare",
    type: CategoryType.expense,
    categories: ["Doctor", "Dentist", "Medication"]
  },
  {
    name: "Leisure and travel",
    type: CategoryType.expense,
    categories: ["Holidays", "Hobbies", "Gifts", "Entertainment"]
  },
  {
    name: "Miscellaneous",
    type: CategoryType.expense,
    categories: ["Buffer", "Cash withdrawal", "Other"]
  }
];

export function getCategoryPreset(preset: CategoryPreset): CategoryGroupPreset[] {
  switch (preset) {
    case "swiss":
      return SWISS;
    case "generic":
    case "german":
    case "french":
    default:
      // German and French currently fall back to Generic. Localised presets
      // can be authored here later without any wizard or API contract change.
      return GENERIC;
  }
}

export const PRESET_LABELS: Record<CategoryPreset, string> = {
  swiss: "Swiss household (CHF, Pillar 3a, Nebenkosten…)",
  german: "German household (generic preset for now)",
  french: "French household (generic preset for now)",
  generic: "Generic — universal categories"
};
