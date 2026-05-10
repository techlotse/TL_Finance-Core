import { prisma } from "./prisma";
import { Decimal, toDecimal } from "./money";

const PROVIDER = process.env.EXCHANGE_RATE_PROVIDER || "frankfurter";
const FRANKFURTER_BASE =
  process.env.FRANKFURTER_BASE_URL || "https://api.frankfurter.app";

const STALE_AFTER_MS = 24 * 60 * 60 * 1000; // 24h

export interface RateResult {
  rate: Decimal;
  date: Date;
  provider: string;
  /** True if the rate could not be refreshed and a stale cache was used. */
  stale: boolean;
}

/** Truncate to start-of-day UTC so we cache one row per day per pair. */
function startOfDayUTC(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

async function fetchFrankfurterRate(
  from: string,
  to: string
): Promise<{ rate: string; date: string } | null> {
  const url = `${FRANKFURTER_BASE}/latest?from=${encodeURIComponent(
    from
  )}&to=${encodeURIComponent(to)}`;
  try {
    const res = await fetch(url, {
      // Don't cache at the fetch layer — we manage caching ourselves in DB.
      cache: "no-store",
      // 8s timeout via AbortController so a hung provider doesn't stall pages.
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      amount: number;
      base: string;
      date: string;
      rates: Record<string, number>;
    };
    const rateNum = json.rates?.[to.toUpperCase()];
    if (rateNum === undefined) return null;
    return { rate: String(rateNum), date: json.date };
  } catch {
    return null;
  }
}

/**
 * Get the rate to convert 1 unit of `from` into `to`. Same currency returns 1.
 * Strategy:
 *   1. Look up today's cache.
 *   2. If missing or stale, try the provider and upsert.
 *   3. If provider fails, return the most recent cached row regardless of age,
 *      flagging it stale. If no cache at all, throw.
 */
export async function getExchangeRate(
  from: string,
  to: string
): Promise<RateResult> {
  const fromU = from.toUpperCase();
  const toU = to.toUpperCase();

  if (fromU === toU) {
    return {
      rate: new Decimal(1),
      date: startOfDayUTC(new Date()),
      provider: "identity",
      stale: false
    };
  }

  const today = startOfDayUTC(new Date());

  const cached = await prisma.exchangeRate.findUnique({
    where: {
      baseCurrency_targetCurrency_date_provider: {
        baseCurrency: fromU,
        targetCurrency: toU,
        date: today,
        provider: PROVIDER
      }
    }
  });

  const isFresh = cached && Date.now() - cached.createdAt.getTime() < STALE_AFTER_MS;
  if (cached && isFresh) {
    return {
      rate: toDecimal(cached.rate),
      date: cached.date,
      provider: cached.provider,
      stale: false
    };
  }

  const fetched = await fetchFrankfurterRate(fromU, toU);
  if (fetched) {
    const date = startOfDayUTC(new Date(fetched.date));
    const upserted = await prisma.exchangeRate.upsert({
      where: {
        baseCurrency_targetCurrency_date_provider: {
          baseCurrency: fromU,
          targetCurrency: toU,
          date,
          provider: PROVIDER
        }
      },
      create: {
        baseCurrency: fromU,
        targetCurrency: toU,
        date,
        provider: PROVIDER,
        rate: fetched.rate
      },
      update: { rate: fetched.rate }
    });
    return {
      rate: toDecimal(upserted.rate),
      date: upserted.date,
      provider: upserted.provider,
      stale: false
    };
  }

  // Provider failed. Fall back to the most recent stored rate of any age.
  const fallback = await prisma.exchangeRate.findFirst({
    where: { baseCurrency: fromU, targetCurrency: toU },
    orderBy: { date: "desc" }
  });
  if (fallback) {
    return {
      rate: toDecimal(fallback.rate),
      date: fallback.date,
      provider: fallback.provider,
      stale: true
    };
  }

  // Try the inverse direction as a last resort: if we have to->from cached,
  // invert it. Better than refusing.
  const inverse = await prisma.exchangeRate.findFirst({
    where: { baseCurrency: toU, targetCurrency: fromU },
    orderBy: { date: "desc" }
  });
  if (inverse) {
    return {
      rate: new Decimal(1).div(toDecimal(inverse.rate)),
      date: inverse.date,
      provider: inverse.provider,
      stale: true
    };
  }

  throw new Error(
    `No exchange rate available for ${fromU}->${toU} and provider is unreachable.`
  );
}

/** Convert an amount from one currency to another via {@link getExchangeRate}. */
export async function convert(
  amount: { toString(): string } | string | number,
  from: string,
  to: string
): Promise<{ amount: Decimal; rate: Decimal; stale: boolean }> {
  const result = await getExchangeRate(from, to);
  return {
    amount: toDecimal(amount).mul(result.rate),
    rate: result.rate,
    stale: result.stale
  };
}

/**
 * Bulk-convert a list of {amount, currency} into a single base currency total.
 * Caches lookups within the call so we hit the DB once per unique source.
 */
export async function convertManyToBase(
  items: { amount: { toString(): string } | string | number; currency: string }[],
  baseCurrency: string
): Promise<{ total: Decimal; staleCurrencies: Set<string> }> {
  const cache = new Map<string, { rate: Decimal; stale: boolean }>();
  const stale = new Set<string>();
  let total = new Decimal(0);

  for (const item of items) {
    const cur = item.currency.toUpperCase();
    let r = cache.get(cur);
    if (!r) {
      const fetched = await getExchangeRate(cur, baseCurrency);
      r = { rate: fetched.rate, stale: fetched.stale };
      cache.set(cur, r);
      if (r.stale) stale.add(cur);
    }
    total = total.plus(toDecimal(item.amount).mul(r.rate));
  }
  return { total, staleCurrencies: stale };
}
