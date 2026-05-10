export const PRODUCT_TIERS = ["core", "smart", "ai"] as const;

export type ProductTier = (typeof PRODUCT_TIERS)[number];

export interface ProductPlanMeta {
  tier: ProductTier;
  name: string;
  shortName: string;
  navSubtitle: string;
  signupTitle: string;
  signupDescription: string;
  priceLabel: string;
  badgeLabel: string;
  markText: string;
  gradient: string;
  accentClass: string;
  features: string[];
}

export const PRODUCT_PLANS: Record<ProductTier, ProductPlanMeta> = {
  core: {
    tier: "core",
    name: "TL Finance Core",
    shortName: "Core",
    navSubtitle: "Household Budget",
    signupTitle: "Budgeting foundation",
    signupDescription:
      "Multi-currency budgets, accounts, forecasts, transfers, assets, and debt tracking.",
    priceLabel: "Included",
    badgeLabel: "Core",
    markText: "TL",
    gradient: "linear-gradient(135deg, #7A3CFF 0%, #00D1C7 100%)",
    accentClass: "border-brand-gradient",
    features: ["Budget and account tracking", "Forecasts", "Assets and debt"]
  },
  smart: {
    tier: "smart",
    name: "TL Finance Smart",
    shortName: "Smart",
    navSubtitle: "Classic Advice",
    signupTitle: "Rules-based advice",
    signupDescription:
      "Adds classic savings, investing, retirement, emergency-fund, and FIRE checks.",
    priceLabel: "Paid",
    badgeLabel: "Smart",
    markText: "S",
    gradient: "linear-gradient(135deg, #0F766E 0%, #84CC16 100%)",
    accentClass: "border-emerald-500/40",
    features: ["Emergency-fund targets", "Savings/investment mix", "FIRE readiness"]
  },
  ai: {
    tier: "ai",
    name: "TL Finance AI",
    shortName: "AI",
    navSubtitle: "AI Planning",
    signupTitle: "AI-assisted planning",
    signupDescription:
      "Includes Smart plus OpenAI-powered recommendations tailored to household context.",
    priceLabel: "Paid",
    badgeLabel: "AI",
    markText: "AI",
    gradient: "linear-gradient(135deg, #111827 0%, #F59E0B 100%)",
    accentClass: "border-amber-500/50",
    features: ["Everything in Smart", "OpenAI analysis", "Prioritized next steps"]
  }
};

const TIER_RANK: Record<ProductTier, number> = {
  core: 0,
  smart: 1,
  ai: 2
};

export function normaliseProductTier(value: unknown): ProductTier {
  return PRODUCT_TIERS.includes(value as ProductTier)
    ? (value as ProductTier)
    : "core";
}

export function hasPlanAtLeast(
  current: ProductTier | null | undefined,
  required: ProductTier
): boolean {
  const tier = normaliseProductTier(current);
  return TIER_RANK[tier] >= TIER_RANK[required];
}
