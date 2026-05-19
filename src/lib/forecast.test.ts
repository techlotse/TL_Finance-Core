import { describe, expect, it } from "vitest";
import type {
  BankAccount,
  BankAccountCurrency,
  ScheduledTransfer
} from "@/generated/prisma/client";
import { forecastBalances, forecastDailyForAccount } from "./forecast";

function account(
  id: string,
  currentBalance: string
): BankAccount & { currencies: BankAccountCurrency[] } {
  return {
    id,
    householdId: "hh_1",
    name: id,
    institution: null,
    accountType: "current",
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
        openingBalance: "0" as unknown as BankAccountCurrency["openingBalance"],
        currentBalance:
          currentBalance as unknown as BankAccountCurrency["currentBalance"],
        createdAt: new Date("2026-05-01T00:00:00.000Z"),
        updatedAt: new Date("2026-05-01T00:00:00.000Z")
      }
    ]
  };
}

function monthlyTransfer(): ScheduledTransfer {
  return {
    id: "tr_1",
    householdId: "hh_1",
    name: "Shared funding",
    sourceAccountId: "source",
    sourceCurrency: "CHF",
    targetAccountId: "target",
    targetCurrency: "CHF",
    amount: "100" as unknown as ScheduledTransfer["amount"],
    recurrence: "monthly",
    startDate: new Date("2026-05-25T00:00:00.000Z"),
    endDate: null,
    notes: null,
    active: true,
    deletedAt: null,
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z")
  };
}

describe("scheduled transfer forecasts", () => {
  it("posts both monthly transfer legs to source and target accounts", async () => {
    const source = account("source", "1000");
    const target = account("target", "500");
    const [point] = await forecastBalances({
      baseCurrency: "CHF",
      accounts: [source, target],
      budgetItems: [],
      transfers: [monthlyTransfer()],
      horizonYears: 1,
      startDate: new Date("2026-05-19T00:00:00.000Z")
    });

    expect(point.accountBalances.source.toString()).toBe("900");
    expect(point.accountBalances.target.toString()).toBe("600");
  });

  it("shows transfer-in events on the target account daily walk", async () => {
    const result = await forecastDailyForAccount({
      baseCurrency: "CHF",
      account: account("target", "500"),
      budgetItems: [],
      transfers: [monthlyTransfer()],
      asOf: new Date("2026-05-19T00:00:00.000Z"),
      pastDays: 0,
      futureDays: 10
    });
    const transferDay = result.points.find((point) =>
      point.events.some((event) => event.kind === "transfer-in")
    );

    expect(transferDay?.perCurrency.CHF.toString()).toBe("600");
    expect(transferDay?.events[0]).toMatchObject({
      kind: "transfer-in",
      currency: "CHF"
    });
    expect(transferDay?.events[0]?.amount.toString()).toBe("100");
  });
});
