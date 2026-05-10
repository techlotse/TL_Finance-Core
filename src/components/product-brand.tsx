import { PRODUCT_PLANS, type ProductTier, normaliseProductTier } from "@/lib/plans";
import { cn } from "@/lib/utils";

export function ProductBrandMark({
  tier,
  size = 32,
  className
}: {
  tier: ProductTier | string | null | undefined;
  size?: number;
  className?: string;
}) {
  const plan = PRODUCT_PLANS[normaliseProductTier(tier)];
  return (
    <span
      style={{
        width: size,
        height: size,
        background: plan.gradient
      }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white shadow-sm",
        className
      )}
      aria-hidden="true"
    >
      {plan.markText}
    </span>
  );
}

export function ProductWordmark({
  tier,
  compact = false
}: {
  tier: ProductTier | string | null | undefined;
  compact?: boolean;
}) {
  const plan = PRODUCT_PLANS[normaliseProductTier(tier)];
  return (
    <div className="leading-tight min-w-0">
      <div
        className={cn(
          "font-semibold tracking-tight truncate",
          compact ? "text-sm" : "text-base"
        )}
      >
        {plan.name}
      </div>
      <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">
        {plan.navSubtitle}
      </div>
    </div>
  );
}
