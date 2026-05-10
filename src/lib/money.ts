import Decimal from "decimal.js";

// Configure decimal.js once for the whole app: 28 digits is plenty for money.
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_EVEN });

export type DecimalInput = Decimal | string | number | { toString(): string };

/**
 * Coerce any value Prisma returns or any user input into a Decimal instance.
 * Always parse via `.toString()` because Prisma's `Decimal` is from a sibling
 * library (decimal.js-light) and must not be mixed.
 */
export function toDecimal(value: DecimalInput | null | undefined): Decimal {
  if (value === null || value === undefined) return new Decimal(0);
  if (value instanceof Decimal) return value;
  return new Decimal(value.toString());
}

/** Format a Decimal-like value for the wire (DB / API). */
export function decimalString(value: DecimalInput, dp = 4): string {
  return toDecimal(value).toFixed(dp);
}

/** Currency-aware default fraction digits. ISO 4217 has special cases (JPY=0). */
export function fractionDigits(currency: string): number {
  const upper = currency.toUpperCase();
  if (["JPY", "KRW", "VND", "ISK", "CLP"].includes(upper)) return 0;
  if (["BHD", "JOD", "KWD", "OMR", "TND"].includes(upper)) return 3;
  return 2;
}

/** Display a money amount (no currency code). */
export function formatMoney(value: DecimalInput, currency = "CHF"): string {
  const d = toDecimal(value);
  const dp = fractionDigits(currency);
  // Use Intl with manual fraction digits so very large numbers stay readable.
  return new Intl.NumberFormat("de-CH", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp
  }).format(d.toNumber());
}

/** Display amount with currency code suffix, e.g. "1'234.56 CHF". */
export function formatMoneyWithCurrency(
  value: DecimalInput,
  currency: string
): string {
  return `${formatMoney(value, currency)} ${currency.toUpperCase()}`;
}

/** Display percentage from a fractional decimal (0.05 → "5.00%"). */
export function formatPercent(value: DecimalInput, dp = 2): string {
  const pct = toDecimal(value).mul(100);
  return `${pct.toFixed(dp)}%`;
}

/** Sum a list of decimal-likes safely. */
export function sumDecimal(values: DecimalInput[]): Decimal {
  return values.reduce<Decimal>(
    (acc, v) => acc.plus(toDecimal(v)),
    new Decimal(0)
  );
}

export { Decimal };
