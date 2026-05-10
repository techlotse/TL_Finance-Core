import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export function MoneyAmount({
  value,
  currency,
  className,
  positive,
  negative,
  showCurrency = true
}: {
  value: { toString(): string } | string | number;
  currency: string;
  className?: string;
  /** If true, force the success colour. Otherwise auto-detect from sign. */
  positive?: boolean;
  negative?: boolean;
  showCurrency?: boolean;
}) {
  const num = Number(value.toString());
  const auto =
    num > 0 ? "text-success" : num < 0 ? "text-destructive" : "";
  const colour = positive
    ? "text-success"
    : negative
    ? "text-destructive"
    : auto;
  return (
    <span className={cn("tabular font-medium", colour, className)}>
      {formatMoney(value, currency)}
      {showCurrency && (
        <span className="ml-1 text-xs text-muted-foreground">{currency}</span>
      )}
    </span>
  );
}
