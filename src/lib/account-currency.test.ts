import { describe, expect, it } from "vitest";
import { effectiveMonthlyCostCurrency } from "./account-currency";

describe("effectiveMonthlyCostCurrency", () => {
  it("uses the explicit account fee currency when present", () => {
    expect(
      effectiveMonthlyCostCurrency(
        {
          monthlyCostCurrency: "zar",
          currencies: [{ currency: "CHF" }, { currency: "ZAR" }]
        },
        "CHF"
      )
    ).toBe("ZAR");
  });

  it("falls back to the first account pocket before the household base", () => {
    expect(
      effectiveMonthlyCostCurrency(
        {
          monthlyCostCurrency: null,
          currencies: [{ currency: "ZAR" }]
        },
        "CHF"
      )
    ).toBe("ZAR");
  });

  it("ignores stale explicit fee currencies that are not account pockets", () => {
    expect(
      effectiveMonthlyCostCurrency(
        {
          monthlyCostCurrency: "CHF",
          currencies: [{ currency: "ZAR" }]
        },
        "CHF"
      )
    ).toBe("ZAR");
  });
});
