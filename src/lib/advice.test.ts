import { describe, expect, it } from "vitest";
import {
  buildClassicAdvice,
  type FinancialSnapshot
} from "./advice";

function snapshot(overrides: Partial<FinancialSnapshot> = {}): FinancialSnapshot {
  const base: FinancialSnapshot = {
    generatedAt: "2026-05-02T00:00:00.000Z",
    householdId: "hh_1",
    baseCurrency: "CHF",
    earnerCount: 1,
    earners: [{ id: "earner_1", name: "Earner", monthlyIncome: "6000" }],
    monthly: {
      income: "6000",
      livingExpenses: "3500",
      investmentContributions: "300",
      bankCharges: "12",
      netAfterPlannedOutflows: "1000",
      savingsCapacity: "1300",
      savingsRate: "0.2167",
      essentialExpenses: "2500",
      flexibleExpenses: "1000"
    },
    balances: {
      liquid: "8000",
      currentAndCash: "3000",
      savings: "5000",
      investments: "20000",
      tangibleAssets: "0",
      totalTracked: "28000",
      creditDebt: "0"
    },
    emergencyFund: {
      targetMonths: 6,
      targetAmount: "15000",
      currentMonths: "3.2",
      surplusOrGap: "-7000"
    },
    jobLoss: {
      largestEarnerMonthlyIncome: "6000",
      remainingIncomeAfterLargestLoss: "0",
      oneEarnerEssentialDeficit: "2500",
      oneEarnerMonthsCovered: "3.2",
      allEarnerMonthsCovered: "3.2",
      redistributableMonthlyExpenses: "1000"
    },
    fire: {
      annualLivingExpenses: "42000",
      targetInvestableAssets: "1050000",
      currentInvestableAssets: "20000",
      monthlyInvestableCapacity: "1300",
      estimatedYearsToFire: 31
    },
    accounts: [],
    lowYieldSavings: [],
    signals: {
      hasKidsPlanning: false,
      hasRetirementPlanning: true,
      hasInvestmentAccounts: true,
      hasHighInterestDebt: false
    }
  };
  return { ...base, ...overrides };
}

describe("buildClassicAdvice", () => {
  it("prioritizes an underfunded emergency reserve", () => {
    const advice = buildClassicAdvice(snapshot());

    expect(advice.recommendations.map((r) => r.id)).toContain(
      "build-emergency-fund"
    );
    expect(advice.recommendations[0].priority).toBe("high");
  });

  it("recommends redeploying excess low-yield savings after the reserve is funded", () => {
    const advice = buildClassicAdvice(
      snapshot({
        balances: {
          liquid: "40000",
          currentAndCash: "5000",
          savings: "35000",
          investments: "50000",
          tangibleAssets: "0",
          totalTracked: "90000",
          creditDebt: "0"
        },
        emergencyFund: {
          targetMonths: 6,
          targetAmount: "15000",
          currentMonths: "16",
          surplusOrGap: "25000"
        },
        lowYieldSavings: [
          {
            id: "acc_1",
            name: "Legacy savings",
            balanceBase: "35000",
            annualInterestRate: "0.001"
          }
        ]
      })
    );

    expect(advice.recommendations.map((r) => r.id)).toContain(
      "redeploy-excess-low-yield-cash"
    );
  });
});
