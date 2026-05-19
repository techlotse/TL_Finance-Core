import { describe, expect, it } from "vitest";
import {
  buildClassicAdvice,
  buildFinancialSnapshotFromData,
  snapshotForAi,
  type FinancialSnapshot
} from "./advice";

type SnapshotInput = Parameters<typeof buildFinancialSnapshotFromData>[0];
type SnapshotAccount = SnapshotInput["accounts"][number];
type SnapshotTransfer = NonNullable<SnapshotInput["transfers"]>[number];

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

describe("snapshotForAi", () => {
  it("keeps account monthly costs in native currency with a base equivalent", () => {
    const aiSnapshot = snapshotForAi(
      snapshot({
        accounts: [
          {
            id: "acc_1",
            name: "ZAR current account",
            accountType: "current",
            balanceBase: "650",
            annualInterestRate: null,
            expectedAnnualReturn: null,
            monthlyCost: "495",
            monthlyCostCurrency: "ZAR",
            monthlyCostBase: "23.50"
          }
        ]
      })
    );

    expect(aiSnapshot.accounts[0].monthlyCost).toEqual({
      amount: "495",
      currency: "ZAR",
      baseAmount: "23.50",
      baseCurrency: "CHF"
    });
  });
});

describe("buildFinancialSnapshotFromData", () => {
  function account(
    id: string,
    accountType: SnapshotAccount["accountType"],
    currentBalance: string
  ): SnapshotAccount {
    return {
      id,
      householdId: "hh_1",
      name: id,
      institution: null,
      accountType,
      monthlyCost: null,
      monthlyCostCurrency: null,
      annualInterestRate: null,
      expectedAnnualReturn: null,
      monthlyManagementCost: null,
      minimumMonthlyPayment: null,
      notes: null,
      active: true,
      deletedAt: null,
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
      updatedAt: new Date("2026-05-01T00:00:00.000Z"),
      currencies: [
        {
          id: `${id}_chf`,
          accountId: id,
          currency: "CHF",
          openingBalance:
            "0" as unknown as SnapshotAccount["currencies"][number]["openingBalance"],
          currentBalance:
            currentBalance as unknown as SnapshotAccount["currencies"][number]["currentBalance"],
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          updatedAt: new Date("2026-05-01T00:00:00.000Z")
        }
      ]
    };
  }

  it("treats transfers into investment accounts as planned investing", async () => {
    const source = account("source", "current", "1000");
    const target = account("target", "investment", "0");
    const transfer: SnapshotTransfer = {
      id: "tr_1",
      householdId: "hh_1",
      name: "Pillar 3a",
      sourceAccountId: source.id,
      sourceAccount: source,
      sourceCurrency: "CHF",
      targetAccountId: target.id,
      targetAccount: target,
      targetCurrency: "CHF",
      amount: "300" as unknown as SnapshotTransfer["amount"],
      recurrence: "monthly",
      startDate: new Date("2026-05-25T00:00:00.000Z"),
      endDate: null,
      notes: null,
      active: true,
      deletedAt: null,
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
      updatedAt: new Date("2026-05-01T00:00:00.000Z")
    };

    const result = await buildFinancialSnapshotFromData({
      householdId: "hh_1",
      baseCurrency: "CHF",
      items: [],
      accounts: [source, target],
      earners: [],
      assets: [],
      investmentProjections: [],
      transfers: [transfer]
    });

    expect(result.monthly.investmentContributions).toBe("300");
    expect(result.monthly.savingsCapacity).toBe("300");
    expect(result.signals.hasInvestmentAccounts).toBe(true);
  });
});
