import { Decimal, toDecimal, type DecimalInput } from "./money";

export interface DebtPayoffInputs {
  /** Outstanding principal today. Positive number — even though it's owed. */
  balance: DecimalInput;
  /** Annual interest (APR) as decimal fraction: 0.18 = 18%. */
  annualInterestRate: DecimalInput;
  /** What the user pays each month. Has to exceed monthly interest or
   *  the balance grows forever; in that case we cap at 1 200 months and
   *  flag the result as `payoffPossible: false`. */
  monthlyPayment: DecimalInput;
  /** Cap horizon — exposed so the chart doesn't allocate huge arrays. */
  maxMonths?: number;
}

export interface DebtPayoffPoint {
  month: number;
  /** Remaining balance at end of month. */
  balance: Decimal;
  /** Cumulative interest paid up to and including this month. */
  cumulativeInterest: Decimal;
  /** Interest charged this month. */
  monthlyInterest: Decimal;
  /** Principal paid this month. */
  monthlyPrincipal: Decimal;
}

export interface DebtPayoffResult {
  payoffPossible: boolean;
  monthsToPayoff: number | null;
  totalInterestPaid: Decimal;
  totalPaid: Decimal;
  series: DebtPayoffPoint[];
}

/**
 * Simulate paying down a debt month-by-month.
 *
 * Each month:
 *   1. Interest accrues on the outstanding balance at annualRate / 12.
 *   2. The user makes a fixed `monthlyPayment` — interest first, principal next.
 *   3. If the balance hits zero we stop early; the last month's payment
 *      is reduced to exactly clear the balance.
 *
 * If `monthlyPayment` doesn't exceed monthly interest the simulation halts
 * after `maxMonths` and `payoffPossible` is false — the UI surfaces this
 * as a warning to the user.
 */
export function projectDebtPayoff(inputs: DebtPayoffInputs): DebtPayoffResult {
  const cap = inputs.maxMonths ?? 1200; // 100 yrs is plenty
  const monthlyRate = toDecimal(inputs.annualInterestRate).div(12);
  let balance = toDecimal(inputs.balance);
  const payment = toDecimal(inputs.monthlyPayment);
  let cumulativeInterest = toDecimal(0);
  let totalPaid = toDecimal(0);

  const series: DebtPayoffPoint[] = [
    {
      month: 0,
      balance,
      cumulativeInterest: toDecimal(0),
      monthlyInterest: toDecimal(0),
      monthlyPrincipal: toDecimal(0)
    }
  ];

  for (let m = 1; m <= cap; m++) {
    if (balance.lte(0)) break;

    const interest = balance.mul(monthlyRate);
    cumulativeInterest = cumulativeInterest.plus(interest);

    // Payment can't exceed (balance + interest) — last month's wraparound.
    const grossDue = balance.plus(interest);
    const thisPayment = payment.gt(grossDue) ? grossDue : payment;
    const principalPaid = thisPayment.minus(interest);
    balance = balance.plus(interest).minus(thisPayment);
    if (balance.lt(0)) balance = toDecimal(0);
    totalPaid = totalPaid.plus(thisPayment);

    series.push({
      month: m,
      balance,
      cumulativeInterest,
      monthlyInterest: interest,
      monthlyPrincipal: principalPaid
    });

    // Detect the "interest > payment forever" condition early so we don't
    // burn 1 200 iterations on hopeless inputs.
    if (m >= 12 && balance.gte(toDecimal(inputs.balance))) {
      return {
        payoffPossible: false,
        monthsToPayoff: null,
        totalInterestPaid: cumulativeInterest,
        totalPaid,
        series
      };
    }
  }

  const paid = balance.lte(0);
  return {
    payoffPossible: paid,
    monthsToPayoff: paid ? series.length - 1 : null,
    totalInterestPaid: cumulativeInterest,
    totalPaid,
    series
  };
}
