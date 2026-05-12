import { ContributionFrequency } from "@/generated/prisma/enums";
import { Decimal, toDecimal, type DecimalInput } from "./money";

export interface InvestmentInputs {
  startingCapital: DecimalInput;
  recurringContribution: DecimalInput;
  contributionFrequency: ContributionFrequency;
  expectedAnnualReturn: DecimalInput;
  annualFeeDrag?: DecimalInput;
  inflationRate?: DecimalInput;
  horizonYears: number;
}

export interface ProjectionPoint {
  year: number;
  month: number;
  monthsElapsed: number;
  contributions: Decimal;
  nominal: Decimal;
  real: Decimal;
}

/** Convert an annual rate to a monthly rate using continuous compounding logic. */
function annualToMonthly(annual: DecimalInput): Decimal {
  const a = toDecimal(annual);
  // (1 + a)^(1/12) - 1
  const pow = Math.pow(1 + a.toNumber(), 1 / 12) - 1;
  return new Decimal(pow);
}

/**
 * Project a single investment plan month-by-month for the requested horizon.
 *
 * - The expected return is reduced by the annual fee drag before compounding.
 * - Contributions are added at the end of each month they fall due.
 * - Real value adjusts the nominal value by cumulative monthly inflation so the
 *   final number is in today's purchasing power.
 */
export function projectInvestment(inputs: InvestmentInputs): ProjectionPoint[] {
  const months = inputs.horizonYears * 12;
  const annualReturn = toDecimal(inputs.expectedAnnualReturn);
  const fee = toDecimal(inputs.annualFeeDrag ?? 0);
  const netAnnual = annualReturn.minus(fee);
  const monthlyRate = annualToMonthly(netAnnual);

  const monthlyInflation = annualToMonthly(inputs.inflationRate ?? 0);

  let balance = toDecimal(inputs.startingCapital);
  let contribTotal = new Decimal(0);

  const series: ProjectionPoint[] = [];
  // Month 0 baseline.
  series.push({
    year: 0,
    month: 0,
    monthsElapsed: 0,
    contributions: contribTotal,
    nominal: balance,
    real: balance
  });

  for (let m = 1; m <= months; m++) {
    // 1. Grow existing balance by one month.
    balance = balance.mul(new Decimal(1).plus(monthlyRate));

    // 2. Add scheduled contribution.
    let contribution = new Decimal(0);
    if (inputs.contributionFrequency === "monthly") {
      contribution = toDecimal(inputs.recurringContribution);
    } else if (inputs.contributionFrequency === "quarterly" && m % 3 === 0) {
      contribution = toDecimal(inputs.recurringContribution);
    } else if (inputs.contributionFrequency === "yearly" && m % 12 === 0) {
      contribution = toDecimal(inputs.recurringContribution);
    }
    if (contribution.gt(0)) {
      balance = balance.plus(contribution);
      contribTotal = contribTotal.plus(contribution);
    }

    // 3. Real value: deflate by cumulative inflation.
    const inflationFactor = new Decimal(1)
      .plus(monthlyInflation)
      .pow(m);
    const real = balance.div(inflationFactor);

    series.push({
      year: Math.floor(m / 12),
      month: m % 12,
      monthsElapsed: m,
      contributions: contribTotal,
      nominal: balance,
      real
    });
  }

  return series;
}

export interface ProjectionSummary {
  totalContributions: Decimal;
  finalNominal: Decimal;
  finalReal: Decimal;
  totalReturn: Decimal;
}

export function summarizeProjection(
  series: ProjectionPoint[]
): ProjectionSummary {
  const last = series[series.length - 1];
  const first = series[0];
  const principalIn = first.nominal.plus(last.contributions);
  return {
    totalContributions: last.contributions,
    finalNominal: last.nominal,
    finalReal: last.real,
    totalReturn: last.nominal.minus(principalIn)
  };
}
