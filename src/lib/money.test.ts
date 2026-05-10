import { describe, expect, it } from "vitest";
import {
  decimalString,
  formatPercent,
  fractionDigits,
  sumDecimal
} from "./money";

describe("money helpers", () => {
  it("rounds persisted decimal strings with banker's rounding", () => {
    expect(decimalString("10.12505")).toBe("10.1250");
    expect(decimalString("10.12515")).toBe("10.1252");
  });

  it("uses ISO-style fraction digit exceptions", () => {
    expect(fractionDigits("CHF")).toBe(2);
    expect(fractionDigits("JPY")).toBe(0);
    expect(fractionDigits("KWD")).toBe(3);
  });

  it("sums decimal-like values without floating point drift", () => {
    expect(sumDecimal(["0.1", "0.2", "0.3"]).toString()).toBe("0.6");
  });

  it("formats fractional rates as percentages", () => {
    expect(formatPercent("0.0525")).toBe("5.25%");
  });
});
