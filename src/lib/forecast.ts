import {
  BankAccount,
  BankAccountCurrency,
  BudgetLineItem,
  Recurrence,
  ScheduledTransfer
} from "@prisma/client";
import { Decimal, toDecimal } from "./money";
import { occurrencesInMonth, monthlyMultiplier as monthlyMultiplierFromRecurrence } from "./recurrence";
import { convertManyToBase, getExchangeRate } from "./exchange-rates";

export const ALLOWED_HORIZONS = [1, 3, 5, 10, 15, 20, 25] as const;
export type Horizon = (typeof ALLOWED_HORIZONS)[number];

export interface ForecastPoint {
  /** ISO month: YYYY-MM */
  month: string;
  date: Date;
  /** Total of liquid account balances in base currency. */
  totalBaseCurrency: Decimal;
  /** Net worth = liquid accounts + accumulated investment-item balances. */
  netWorthBaseCurrency: Decimal;
  accountBalances: Record<string, Decimal>;
  /** Per investment-typed budget item, the accumulated notional balance. */
  investmentBalances: Record<string, Decimal>;
  monthlyIncome: Decimal;
  monthlyExpenses: Decimal;
  netCashflow: Decimal;
}

export interface ForecastInputs {
  baseCurrency: string;
  accounts: (BankAccount & { currencies: BankAccountCurrency[] })[];
  budgetItems: BudgetLineItem[];
  transfers: ScheduledTransfer[];
  horizonYears: Horizon;
  startDate?: Date;
}

/**
 * Generate a month-by-month forecast for every account, every investment-typed
 * budget item, and the household's net worth.
 *
 * Mechanics:
 * - Per-account, per-currency native balances tracked to avoid FX rounding drift.
 *   Snapshot is converted to base currency at month-end.
 * - Investment-typed budget items each maintain a notional balance that grows
 *   at (1 + expectedAnnualReturn)^(1/12) − 1 per month, less monthlyManagementCost.
 * - BankAccount.monthlyCost is debited from the account once per month and
 *   counted as expense (the synthetic "Financial Management → Bank Charges").
 * - Savings interest: when accountType = savings, each currency pocket accrues
 *   (1 + annualInterestRate)^(1/12) − 1 each month.
 */
export async function forecastBalances(
  inputs: ForecastInputs
): Promise<ForecastPoint[]> {
  const start = startOfMonth(inputs.startDate ?? new Date());
  const months = inputs.horizonYears * 12;

  const rateCache = new Map<string, Decimal>();
  async function rate(from: string, to: string): Promise<Decimal> {
    const f = from.toUpperCase();
    const t = to.toUpperCase();
    if (f === t) return new Decimal(1);
    const key = `${f}:${t}`;
    let r = rateCache.get(key);
    if (!r) {
      const fetched = await getExchangeRate(f, t);
      r = fetched.rate;
      rateCache.set(key, r);
    }
    return r;
  }

  // Per-(accountId, currency) running balance.
  const balances = new Map<string, Decimal>();
  const accountById = new Map(inputs.accounts.map((a) => [a.id, a] as const));
  function key(accountId: string, currency: string) {
    return `${accountId}::${currency.toUpperCase()}`;
  }
  for (const acc of inputs.accounts) {
    for (const pocket of acc.currencies) {
      balances.set(
        key(acc.id, pocket.currency),
        toDecimal(pocket.currentBalance)
      );
    }
  }

  // Per investment-typed budget item, accumulated notional balance.
  const investmentBalances = new Map<string, Decimal>();
  for (const item of inputs.budgetItems) {
    if (item.itemType === "investment_contribution") {
      investmentBalances.set(item.id, new Decimal(0));
    }
  }

  const series: ForecastPoint[] = [];

  for (let m = 0; m < months; m++) {
    const monthAnchor = addMonths(start, m);

    let monthlyIncome = new Decimal(0);
    let monthlyExpenses = new Decimal(0);

    // 1. Apply budget items.
    for (const item of inputs.budgetItems) {
      if (!item.active) continue;
      const occurrences = occurrencesInMonth(
        item.recurrence as Recurrence,
        item.startDate,
        item.endDate ?? null,
        monthAnchor
      );
      if (occurrences === 0) continue;

      const totalAmt = toDecimal(item.amount).mul(occurrences);
      const accountId = item.accountId ?? "_unassigned";
      const k = key(accountId, item.currency);
      const prev = balances.get(k) ?? new Decimal(0);

      if (item.itemType === "income") {
        balances.set(k, prev.plus(totalAmt));
        monthlyIncome = monthlyIncome.plus(
          totalAmt.mul(await rate(item.currency, inputs.baseCurrency))
        );
      } else if (item.itemType === "expense") {
        balances.set(k, prev.minus(totalAmt));
        monthlyExpenses = monthlyExpenses.plus(
          totalAmt.mul(await rate(item.currency, inputs.baseCurrency))
        );
      } else {
        // investment_contribution: outflow from account, into the item's bucket.
        balances.set(k, prev.minus(totalAmt));
        const prevInv = investmentBalances.get(item.id) ?? new Decimal(0);
        investmentBalances.set(item.id, prevInv.plus(totalAmt));
        monthlyExpenses = monthlyExpenses.plus(
          totalAmt.mul(await rate(item.currency, inputs.baseCurrency))
        );
      }
    }

    // 2. Apply scheduled transfers.
    for (const tr of inputs.transfers) {
      if (!tr.active) continue;
      const occurrences = occurrencesInMonth(
        tr.recurrence as Recurrence,
        tr.startDate,
        tr.endDate ?? null,
        monthAnchor
      );
      if (occurrences === 0) continue;

      const sourceAmt = toDecimal(tr.amount).mul(occurrences);
      const conversionRate = await rate(tr.sourceCurrency, tr.targetCurrency);
      const targetAmt = sourceAmt.mul(conversionRate);
      const sk = key(tr.sourceAccountId, tr.sourceCurrency);
      const tk = key(tr.targetAccountId, tr.targetCurrency);
      balances.set(sk, (balances.get(sk) ?? new Decimal(0)).minus(sourceAmt));
      balances.set(tk, (balances.get(tk) ?? new Decimal(0)).plus(targetAmt));
    }

    // 3. Apply per-account monthly cost (virtual "Bank Charges" debit).
    for (const acc of inputs.accounts) {
      if (!acc.active || !acc.monthlyCost) continue;
      const cost = toDecimal(acc.monthlyCost);
      if (cost.eq(0)) continue;
      const cur = (acc.monthlyCostCurrency ?? inputs.baseCurrency).toUpperCase();
      const k = key(acc.id, cur);
      balances.set(k, (balances.get(k) ?? new Decimal(0)).minus(cost));
      monthlyExpenses = monthlyExpenses.plus(
        cost.mul(await rate(cur, inputs.baseCurrency))
      );
    }

    // 4. Apply savings interest (compounded monthly).
    for (const acc of inputs.accounts) {
      if (!acc.active || acc.accountType !== "savings") continue;
      if (!acc.annualInterestRate) continue;
      const annual = toDecimal(acc.annualInterestRate);
      if (annual.eq(0)) continue;
      const monthly = annualToMonthly(annual);
      // Iterate every pocket we know exists for this account.
      for (const [k, bal] of balances) {
        if (!k.startsWith(`${acc.id}::`)) continue;
        if (bal.lte(0)) continue;
        const interest = bal.mul(monthly);
        balances.set(k, bal.plus(interest));
        const cur = k.split("::")[1];
        monthlyIncome = monthlyIncome.plus(
          interest.mul(await rate(cur, inputs.baseCurrency))
        );
      }
    }

    // 5. Grow each investment-item bucket (after fees).
    for (const item of inputs.budgetItems) {
      if (item.itemType !== "investment_contribution") continue;
      const balance = investmentBalances.get(item.id) ?? new Decimal(0);
      if (balance.lte(0)) continue;
      const annual = item.expectedAnnualReturn
        ? toDecimal(item.expectedAnnualReturn)
        : new Decimal(0);
      const fees = item.monthlyManagementCost
        ? toDecimal(item.monthlyManagementCost)
        : new Decimal(0);
      const monthly = annualToMonthly(annual);
      const grown = balance.mul(new Decimal(1).plus(monthly)).minus(fees);
      investmentBalances.set(item.id, Decimal.max(grown, new Decimal(0)));
    }

    // 6. Snapshot.
    const accountBalances: Record<string, Decimal> = {};
    let total = new Decimal(0);
    for (const acc of inputs.accounts) {
      let perAccount = new Decimal(0);
      const seen = new Set<string>();
      for (const pocket of acc.currencies) {
        const c = pocket.currency.toUpperCase();
        seen.add(c);
        const bal = balances.get(key(acc.id, c)) ?? new Decimal(0);
        perAccount = perAccount.plus(
          bal.mul(await rate(c, inputs.baseCurrency))
        );
      }
      // New pockets created on the fly by budget items.
      for (const [k, v] of balances) {
        if (!k.startsWith(`${acc.id}::`)) continue;
        const cur = k.split("::")[1];
        if (seen.has(cur)) continue;
        perAccount = perAccount.plus(
          v.mul(await rate(cur, inputs.baseCurrency))
        );
      }
      accountBalances[acc.id] = perAccount;
      total = total.plus(perAccount);
    }

    // Unassigned pool — count toward totals so net cashflow ≈ Δtotal.
    for (const [k, v] of balances) {
      if (!k.startsWith("_unassigned::")) continue;
      const cur = k.split("::")[1];
      total = total.plus(v.mul(await rate(cur, inputs.baseCurrency)));
    }

    // Investment buckets, in base currency (each item knows its own currency).
    const investmentBalancesOut: Record<string, Decimal> = {};
    let investmentBaseTotal = new Decimal(0);
    for (const item of inputs.budgetItems) {
      if (item.itemType !== "investment_contribution") continue;
      const bal = investmentBalances.get(item.id) ?? new Decimal(0);
      const r = await rate(item.currency, inputs.baseCurrency);
      const inBase = bal.mul(r);
      investmentBalancesOut[item.id] = inBase;
      investmentBaseTotal = investmentBaseTotal.plus(inBase);
    }

    series.push({
      month: monthLabel(monthAnchor),
      date: monthAnchor,
      totalBaseCurrency: total,
      netWorthBaseCurrency: total.plus(investmentBaseTotal),
      accountBalances,
      investmentBalances: investmentBalancesOut,
      monthlyIncome,
      monthlyExpenses,
      netCashflow: monthlyIncome.minus(monthlyExpenses)
    });

    // Quiet TS that accountById is referenced (it's used as a sentinel for
    // future per-account features; safe to keep).
    void accountById;
  }

  return series;
}

function annualToMonthly(annual: Decimal): Decimal {
  // (1 + annual)^(1/12) - 1 via natural log (Decimal lacks fractional pow).
  if (annual.eq(0)) return new Decimal(0);
  const f = Math.pow(1 + Number(annual.toString()), 1 / 12) - 1;
  return new Decimal(f);
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function monthLabel(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// ---------------------------------------------------------------------------
// Daily forecast for a single account
// ---------------------------------------------------------------------------

export interface DailyEvent {
  kind: "item-in" | "item-out" | "transfer-in" | "transfer-out" | "fee" | "interest";
  name: string;
  amount: Decimal; // signed in the pocket's native currency
  currency: string;
}

export interface DailyAccountPoint {
  date: Date;
  totalBaseCurrency: Decimal;
  perCurrency: Record<string, Decimal>;
  events: DailyEvent[];
}

export interface DailyAccountForecast {
  account: { id: string; name: string };
  baseCurrency: string;
  pastDays: number;
  futureDays: number;
  todayIndex: number;
  points: DailyAccountPoint[];
  /** Lowest projected balance and its date. */
  low: { date: Date; totalBaseCurrency: Decimal };
  /** True if low.totalBaseCurrency < 0 within the visible window. */
  goesNegative: boolean;
}

export interface DailyForecastInputs {
  baseCurrency: string;
  account: BankAccount & { currencies: BankAccountCurrency[] };
  budgetItems: BudgetLineItem[];
  transfers: ScheduledTransfer[];
  pastDays?: number;
  futureDays?: number;
  asOf?: Date;
}

/**
 * Daily walk for one account: events scheduled by debit date drive deltas;
 * we anchor the current balance at end-of-today and propagate forward and
 * backward. Used to surface dips below zero before they happen.
 */
export async function forecastDailyForAccount(
  inputs: DailyForecastInputs
): Promise<DailyAccountForecast> {
  const today = startOfDay(inputs.asOf ?? new Date());
  const pastDays = inputs.pastDays ?? 30;
  const futureDays = inputs.futureDays ?? 60;

  const rateCache = new Map<string, Decimal>();
  async function rate(from: string, to: string): Promise<Decimal> {
    const f = from.toUpperCase();
    const t = to.toUpperCase();
    if (f === t) return new Decimal(1);
    const key = `${f}:${t}`;
    let r = rateCache.get(key);
    if (!r) {
      const fetched = await getExchangeRate(f, t);
      r = fetched.rate;
      rateCache.set(key, r);
    }
    return r;
  }

  const totalDays = pastDays + futureDays + 1;
  const dates: Date[] = [];
  for (let i = 0; i < totalDays; i++) {
    dates.push(addDays(today, -pastDays + i));
  }
  const todayIndex = pastDays;

  // Per-day, per-currency event list (pocket-native currency).
  const eventsByIndex: DailyEvent[][] = dates.map(() => []);

  function pushEvent(d: Date, e: DailyEvent) {
    const idx = dayIndex(dates, d);
    if (idx < 0) return;
    eventsByIndex[idx].push(e);
  }

  // Window bounds for occurrence enumeration.
  const winStart = dates[0];
  const winEnd = dates[dates.length - 1];

  // 1. Item occurrences for items belonging to (or unassigned and matching a
  //    pocket of) this account.
  for (const item of inputs.budgetItems) {
    if (!item.active) continue;
    if (item.accountId && item.accountId !== inputs.account.id) continue;
    if (!item.accountId) continue; // unassigned items don't dock a specific account
    const occurrences = enumerateOccurrences(
      item.recurrence as Recurrence,
      item.startDate,
      item.endDate ?? null,
      item.debitDayOfMonth ?? null,
      winStart,
      winEnd
    );
    for (const occDate of occurrences) {
      const amt = toDecimal(item.amount);
      if (item.itemType === "income") {
        pushEvent(occDate, {
          kind: "item-in",
          name: item.name,
          amount: amt,
          currency: item.currency
        });
      } else {
        pushEvent(occDate, {
          kind: "item-out",
          name: item.name,
          amount: amt.neg(),
          currency: item.currency
        });
      }
    }
  }

  // 2. Transfers.
  for (const tr of inputs.transfers) {
    if (!tr.active) continue;
    const isSource = tr.sourceAccountId === inputs.account.id;
    const isTarget = tr.targetAccountId === inputs.account.id;
    if (!isSource && !isTarget) continue;
    const occurrences = enumerateOccurrences(
      tr.recurrence as Recurrence,
      tr.startDate,
      tr.endDate ?? null,
      null,
      winStart,
      winEnd
    );
    for (const occDate of occurrences) {
      const sourceAmt = toDecimal(tr.amount);
      if (isSource) {
        pushEvent(occDate, {
          kind: "transfer-out",
          name: `→ transfer: ${tr.name}`,
          amount: sourceAmt.neg(),
          currency: tr.sourceCurrency
        });
      }
      if (isTarget) {
        const conv = await rate(tr.sourceCurrency, tr.targetCurrency);
        pushEvent(occDate, {
          kind: "transfer-in",
          name: `← transfer: ${tr.name}`,
          amount: sourceAmt.mul(conv),
          currency: tr.targetCurrency
        });
      }
    }
  }

  // 3. Account monthly cost — fired on the 1st of every month within window.
  if (inputs.account.monthlyCost) {
    const cost = toDecimal(inputs.account.monthlyCost);
    if (!cost.eq(0)) {
      const cur =
        (inputs.account.monthlyCostCurrency ?? inputs.baseCurrency).toUpperCase();
      const cursor = new Date(winStart.getFullYear(), winStart.getMonth(), 1);
      while (cursor <= winEnd) {
        if (cursor >= winStart) {
          pushEvent(new Date(cursor), {
            kind: "fee",
            name: "Bank charges",
            amount: cost.neg(),
            currency: cur
          });
        }
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }
  }

  // 4. Savings interest — fire on the last day of each month within window.
  if (
    inputs.account.accountType === "savings" &&
    inputs.account.annualInterestRate &&
    !toDecimal(inputs.account.annualInterestRate).eq(0)
  ) {
    const monthly = annualToMonthly(toDecimal(inputs.account.annualInterestRate));
    let cursor = new Date(winStart.getFullYear(), winStart.getMonth() + 1, 0);
    while (cursor <= winEnd) {
      if (cursor >= winStart) {
        // Per-pocket interest pulled from current pocket balance at cursor's
        // index. Since balances are computed downstream, we encode interest
        // as a proportional event applied on the spot. To keep things simple
        // and explainable, we *don't* compound interest on interest within
        // this 90-day window — we apply it on currentBalance for each pocket,
        // which is a small approximation but visible and traceable.
        for (const pocket of inputs.account.currencies) {
          const interest = toDecimal(pocket.currentBalance).mul(monthly);
          if (!interest.eq(0)) {
            pushEvent(new Date(cursor), {
              kind: "interest",
              name: "Savings interest",
              amount: interest,
              currency: pocket.currency
            });
          }
        }
      }
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 2, 0);
    }
  }

  // ---------------------------------------------------------------
  // Compute balances. Convention: balance[todayIndex] = currentBalance
  // (anchored at end of today). Forward: add events on day d. Backward:
  // subtract events on day d.
  // ---------------------------------------------------------------
  const currentByCurrency = new Map<string, Decimal>();
  for (const pocket of inputs.account.currencies) {
    currentByCurrency.set(
      pocket.currency.toUpperCase(),
      toDecimal(pocket.currentBalance)
    );
  }
  // Pre-add any currencies introduced by events but not in pockets.
  for (const list of eventsByIndex) {
    for (const e of list) {
      const c = e.currency.toUpperCase();
      if (!currentByCurrency.has(c)) currentByCurrency.set(c, new Decimal(0));
    }
  }
  const allCurrencies = Array.from(currentByCurrency.keys());

  const points: DailyAccountPoint[] = new Array(totalDays);

  // First, today.
  {
    const perCurrency: Record<string, Decimal> = {};
    let total = new Decimal(0);
    for (const c of allCurrencies) {
      const v = currentByCurrency.get(c) ?? new Decimal(0);
      perCurrency[c] = v;
      total = total.plus(v.mul(await rate(c, inputs.baseCurrency)));
    }
    points[todayIndex] = {
      date: dates[todayIndex],
      totalBaseCurrency: total,
      perCurrency,
      events: eventsByIndex[todayIndex]
    };
  }

  // Forward.
  for (let i = todayIndex + 1; i < totalDays; i++) {
    const prev = points[i - 1].perCurrency;
    const next: Record<string, Decimal> = { ...prev };
    for (const e of eventsByIndex[i]) {
      const c = e.currency.toUpperCase();
      next[c] = (next[c] ?? new Decimal(0)).plus(e.amount);
    }
    let total = new Decimal(0);
    for (const c of allCurrencies) {
      total = total.plus(
        (next[c] ?? new Decimal(0)).mul(await rate(c, inputs.baseCurrency))
      );
    }
    points[i] = {
      date: dates[i],
      totalBaseCurrency: total,
      perCurrency: next,
      events: eventsByIndex[i]
    };
  }

  // Backward.
  for (let i = todayIndex - 1; i >= 0; i--) {
    const after = points[i + 1].perCurrency;
    const next: Record<string, Decimal> = { ...after };
    // To go from end-of-(i+1) back to end-of-i, undo events on (i+1).
    for (const e of eventsByIndex[i + 1]) {
      const c = e.currency.toUpperCase();
      next[c] = (next[c] ?? new Decimal(0)).minus(e.amount);
    }
    let total = new Decimal(0);
    for (const c of allCurrencies) {
      total = total.plus(
        (next[c] ?? new Decimal(0)).mul(await rate(c, inputs.baseCurrency))
      );
    }
    points[i] = {
      date: dates[i],
      totalBaseCurrency: total,
      perCurrency: next,
      events: eventsByIndex[i]
    };
  }

  // Lowest balance over the future window (today onwards).
  let lowIdx = todayIndex;
  for (let i = todayIndex; i < totalDays; i++) {
    if (points[i].totalBaseCurrency.lt(points[lowIdx].totalBaseCurrency)) {
      lowIdx = i;
    }
  }

  return {
    account: { id: inputs.account.id, name: inputs.account.name },
    baseCurrency: inputs.baseCurrency,
    pastDays,
    futureDays,
    todayIndex,
    points,
    low: {
      date: points[lowIdx].date,
      totalBaseCurrency: points[lowIdx].totalBaseCurrency
    },
    goesNegative: points[lowIdx].totalBaseCurrency.lt(0)
  };
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function dayIndex(dates: Date[], target: Date): number {
  // dates is sorted ascending, contiguous. dates[0] is the floor.
  const t = startOfDay(target).getTime();
  const base = dates[0].getTime();
  const ms = t - base;
  if (ms < 0) return -1;
  const idx = Math.round(ms / (24 * 60 * 60 * 1000));
  if (idx >= dates.length) return -1;
  return idx;
}

function lastDayOfMonth(year: number, monthZeroBased: number): number {
  return new Date(year, monthZeroBased + 1, 0).getDate();
}

/** Resolve the actual debit date for monthly/quarterly/yearly recurrences,
 *  clamping `debitDayOfMonth` to the month's last valid day. */
function dayInMonth(
  year: number,
  monthZeroBased: number,
  preferredDay: number
): Date {
  const max = lastDayOfMonth(year, monthZeroBased);
  return new Date(year, monthZeroBased, Math.min(preferredDay, max));
}

/**
 * Enumerate every actual date this recurrence fires within [winStart, winEnd].
 * `debitDay` (1-31) overrides the schedule's startDate day for monthly,
 * quarterly, and yearly recurrences; ignored for `weekly` and `once`.
 */
function enumerateOccurrences(
  recurrence: Recurrence,
  startDate: Date,
  endDate: Date | null,
  debitDay: number | null,
  winStart: Date,
  winEnd: Date
): Date[] {
  const out: Date[] = [];
  const start = startOfDay(startDate);
  const end = endDate ? startOfDay(endDate) : null;

  function pushIfInWindow(d: Date) {
    if (d < winStart) return;
    if (d > winEnd) return;
    if (d < start) return;
    if (end && d > end) return;
    out.push(d);
  }

  switch (recurrence) {
    case "once": {
      pushIfInWindow(start);
      break;
    }
    case "weekly": {
      // Step weekly from start until past winEnd. Fast-forward to within the
      // window first.
      let cursor = new Date(start);
      if (cursor < winStart) {
        const ms = winStart.getTime() - cursor.getTime();
        const weeks = Math.floor(ms / (7 * 24 * 60 * 60 * 1000));
        cursor = addDays(cursor, weeks * 7);
        // ensure we land >= winStart
        while (cursor < winStart) cursor = addDays(cursor, 7);
      }
      while (cursor <= winEnd) {
        pushIfInWindow(new Date(cursor));
        cursor = addDays(cursor, 7);
      }
      break;
    }
    case "monthly": {
      const day = debitDay ?? start.getDate();
      // Walk months from start up to winEnd.
      const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      const fence = new Date(winEnd.getFullYear(), winEnd.getMonth() + 1, 1);
      while (cursor < fence) {
        const fired = dayInMonth(cursor.getFullYear(), cursor.getMonth(), day);
        pushIfInWindow(fired);
        cursor.setMonth(cursor.getMonth() + 1);
      }
      break;
    }
    case "quarterly": {
      const day = debitDay ?? start.getDate();
      const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      const fence = new Date(winEnd.getFullYear(), winEnd.getMonth() + 1, 1);
      while (cursor < fence) {
        const fired = dayInMonth(cursor.getFullYear(), cursor.getMonth(), day);
        pushIfInWindow(fired);
        cursor.setMonth(cursor.getMonth() + 3);
      }
      break;
    }
    case "yearly": {
      const day = debitDay ?? start.getDate();
      const month = start.getMonth();
      let year = start.getFullYear();
      while (year <= winEnd.getFullYear()) {
        const fired = dayInMonth(year, month, day);
        pushIfInWindow(fired);
        year += 1;
      }
      break;
    }
  }
  return out;
}

/**
 * Aggregate budget items into the four key dashboard numbers in base currency.
 * Includes account monthly costs as virtual expenses under "Bank Charges".
 */
export async function summarizeMonthlyBudget(
  baseCurrency: string,
  budgetItems: BudgetLineItem[],
  accounts: BankAccount[] = []
): Promise<{
  monthlyIncome: Decimal;
  monthlyExpenses: Decimal;
  monthlyInvestmentContributions: Decimal;
  monthlyBankCharges: Decimal;
  net: Decimal;
  staleCurrencies: string[];
}> {
  const monthlyOf = (item: BudgetLineItem) => {
    const mult = monthlyMultiplierFromRecurrence(item.recurrence as Recurrence);
    return toDecimal(item.amount).mul(mult);
  };

  const incomes = budgetItems
    .filter((i) => i.active && i.itemType === "income")
    .map((i) => ({ amount: monthlyOf(i), currency: i.currency }));
  const expenses = budgetItems
    .filter((i) => i.active && i.itemType === "expense")
    .map((i) => ({ amount: monthlyOf(i), currency: i.currency }));
  const investments = budgetItems
    .filter((i) => i.active && i.itemType === "investment_contribution")
    .map((i) => ({ amount: monthlyOf(i), currency: i.currency }));

  const bankCharges = accounts
    .filter((a) => a.active && a.monthlyCost && !toDecimal(a.monthlyCost).eq(0))
    .map((a) => ({
      amount: toDecimal(a.monthlyCost!),
      currency: a.monthlyCostCurrency ?? baseCurrency
    }));

  const incomeRes = await convertManyToBase(incomes, baseCurrency);
  const expenseRes = await convertManyToBase(expenses, baseCurrency);
  const investRes = await convertManyToBase(investments, baseCurrency);
  const chargesRes = await convertManyToBase(bankCharges, baseCurrency);

  const stale = new Set<string>([
    ...incomeRes.staleCurrencies,
    ...expenseRes.staleCurrencies,
    ...investRes.staleCurrencies,
    ...chargesRes.staleCurrencies
  ]);

  const totalExpenses = expenseRes.total
    .plus(investRes.total)
    .plus(chargesRes.total);

  return {
    monthlyIncome: incomeRes.total,
    monthlyExpenses: totalExpenses,
    monthlyInvestmentContributions: investRes.total,
    monthlyBankCharges: chargesRes.total,
    net: incomeRes.total.minus(totalExpenses),
    staleCurrencies: Array.from(stale)
  };
}
