import { Recurrence } from "@prisma/client";
import { Decimal, toDecimal } from "./money";

/**
 * Convert any recurrence to its monthly equivalent multiplier.
 * once     → 1/12  (single events spread evenly across the year for budgeting)
 * weekly   → 52/12
 * monthly  → 1
 * quarterly→ 1/3
 * yearly   → 1/12
 *
 * The "once" case is admittedly a budgeting convention, not a calendar fact.
 * For the forecast engine we use {@link occursInMonth} which respects exact
 * dates instead.
 */
export function monthlyMultiplier(recurrence: Recurrence): Decimal {
  switch (recurrence) {
    case "once":
      return new Decimal(1).div(12);
    case "weekly":
      return new Decimal(52).div(12);
    case "monthly":
      return new Decimal(1);
    case "quarterly":
      return new Decimal(1).div(3);
    case "yearly":
      return new Decimal(1).div(12);
  }
}

export function yearlyMultiplier(recurrence: Recurrence): Decimal {
  return monthlyMultiplier(recurrence).mul(12);
}

export function monthlyEquivalent(
  amount: { toString(): string } | string | number,
  recurrence: Recurrence
): Decimal {
  return toDecimal(amount).mul(monthlyMultiplier(recurrence));
}

/**
 * Given a start (and optional end) date plus a recurrence rule, decide whether
 * an event occurs *at all* during the calendar month containing `monthAnchor`.
 *
 * Used by the forecast engine which iterates month-by-month and applies the
 * full amount in the months when it occurs (rather than smoothed).
 */
export function occursInMonth(
  recurrence: Recurrence,
  startDate: Date,
  endDate: Date | null,
  monthAnchor: Date
): boolean {
  const monthStart = new Date(
    monthAnchor.getFullYear(),
    monthAnchor.getMonth(),
    1
  );
  const monthEnd = new Date(
    monthAnchor.getFullYear(),
    monthAnchor.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  );

  if (startDate > monthEnd) return false;
  if (endDate && endDate < monthStart) return false;

  switch (recurrence) {
    case "once": {
      return startDate >= monthStart && startDate <= monthEnd;
    }
    case "weekly": {
      // At least one weekly occurrence falls inside any month after start.
      return startDate <= monthEnd;
    }
    case "monthly": {
      return startDate <= monthEnd;
    }
    case "quarterly": {
      // Triggers every 3 months from the start month.
      const monthsFromStart =
        (monthAnchor.getFullYear() - startDate.getFullYear()) * 12 +
        (monthAnchor.getMonth() - startDate.getMonth());
      return monthsFromStart >= 0 && monthsFromStart % 3 === 0;
    }
    case "yearly": {
      return startDate.getMonth() === monthAnchor.getMonth() &&
        startDate <= monthEnd;
    }
  }
}

/**
 * How many full occurrences happen inside the calendar month of `monthAnchor`.
 * Weekly events can occur 4 or 5 times in a month — we count exactly.
 */
export function occurrencesInMonth(
  recurrence: Recurrence,
  startDate: Date,
  endDate: Date | null,
  monthAnchor: Date
): number {
  if (!occursInMonth(recurrence, startDate, endDate, monthAnchor)) return 0;

  if (recurrence === "weekly") {
    const monthStart = new Date(
      monthAnchor.getFullYear(),
      monthAnchor.getMonth(),
      1
    );
    const monthEnd = new Date(
      monthAnchor.getFullYear(),
      monthAnchor.getMonth() + 1,
      0
    );
    let count = 0;
    const cursor = new Date(Math.max(startDate.getTime(), monthStart.getTime()));
    // Align cursor to the first occurrence on/after monthStart matching startDate's weekday.
    const dowDiff = (startDate.getDay() - cursor.getDay() + 7) % 7;
    cursor.setDate(cursor.getDate() + dowDiff);
    while (cursor <= monthEnd) {
      if (!endDate || cursor <= endDate) count++;
      cursor.setDate(cursor.getDate() + 7);
    }
    return count;
  }
  return 1;
}
