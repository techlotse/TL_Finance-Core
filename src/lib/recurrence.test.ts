import { describe, expect, it } from "vitest";
import {
  monthlyEquivalent,
  monthlyMultiplier,
  occurrencesInMonth,
  occursInMonth
} from "./recurrence";

describe("recurrence helpers", () => {
  it("converts recurring values to monthly equivalents", () => {
    expect(monthlyMultiplier("monthly").toString()).toBe("1");
    expect(monthlyEquivalent("1200", "yearly").toString()).toBe("100");
    expect(monthlyEquivalent("300", "quarterly").toFixed(2)).toBe("100.00");
  });

  it("detects exact one-off months", () => {
    expect(
      occursInMonth(
        "once",
        new Date(2026, 4, 15),
        null,
        new Date(2026, 4, 1)
      )
    ).toBe(true);
    expect(
      occursInMonth(
        "once",
        new Date(2026, 4, 15),
        null,
        new Date(2026, 5, 1)
      )
    ).toBe(false);
  });

  it("counts weekly occurrences inside a calendar month", () => {
    expect(
      occurrencesInMonth(
        "weekly",
        new Date(2026, 4, 1),
        null,
        new Date(2026, 4, 1)
      )
    ).toBe(5);
  });
});
