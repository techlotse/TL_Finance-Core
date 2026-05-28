import { describe, expect, it } from "vitest";
import { parseStatementInput } from "./detect";
import {
  createStatementInput,
  createTransactionDedupeHash,
  parseDateToIsoDate,
  parseMoneyToDecimalString
} from "./normalize";

describe("generic CSV statement parser", () => {
  it("normalizes delimited statement rows with signed amounts", async () => {
    const input = createStatementInput({
      fileName: "statement.csv",
      text: [
        "Date;Description;Amount;Currency;Balance;Reference",
        "2026-05-01;Salary;5000.00;CHF;7500.00;PAY-1",
        "02.05.2026;Migros;-123,45;CHF;7376.55;CARD-1"
      ].join("\n")
    });

    const parsed = await parseStatementInput({ input });

    expect(parsed.parserKey).toBe("generic-csv");
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({
      bookingDate: "2026-05-01",
      amount: "5000.0000",
      currency: "CHF",
      balanceAfter: "7500.0000",
      normalizedMerchantKey: "salary"
    });
    expect(parsed.rows[1]).toMatchObject({
      bookingDate: "2026-05-02",
      amount: "-123.4500",
      normalizedMerchantKey: "migros"
    });
  });

  it("normalizes debit and credit columns without guessing currency", async () => {
    const input = createStatementInput({
      text: [
        "Booking Date,Details,Debit,Credit",
        "2026-05-01,Rent,2200.00,",
        "2026-05-02,Refund,,25.00"
      ].join("\n"),
      defaultCurrency: "chf"
    });

    const parsed = await parseStatementInput({ input, parserKey: "generic-csv" });

    expect(parsed.rows.map((row) => row.amount)).toEqual(["-2200.0000", "25.0000"]);
    expect(parsed.rows.map((row) => row.currency)).toEqual(["CHF", "CHF"]);
  });

  it("reports row warnings instead of silently dropping invalid rows", async () => {
    const input = createStatementInput({
      text: [
        "Date,Description,Amount,Currency",
        "not-a-date,Unknown,-5.00,CHF",
        "2026-05-02,,10.00,CHF"
      ].join("\n")
    });

    const parsed = await parseStatementInput({ input });

    expect(parsed.rows).toHaveLength(0);
    expect(parsed.warnings.map((warning) => warning.code)).toEqual([
      "invalid_date",
      "missing_description"
    ]);
  });
});

describe("statement normalization helpers", () => {
  it("parses supported dates and money formats", () => {
    expect(parseDateToIsoDate("31.05.2026")).toBe("2026-05-31");
    expect(parseDateToIsoDate("20260531")).toBe("2026-05-31");
    expect(parseMoneyToDecimalString("CHF 1'234.50")).toBe("1234.5000");
    expect(parseMoneyToDecimalString("(1.234,50)")).toBe("-1234.5000");
  });

  it("creates stable row dedupe hashes", () => {
    const row = {
      bookingDate: "2026-05-01",
      amount: "-10.0000",
      currency: "CHF",
      description: "Card 12345 Migros",
      raw: { Description: "Card 12345 Migros" },
      normalizedMerchantKey: "card migros"
    };

    expect(
      createTransactionDedupeHash({
        householdId: "hh_1",
        accountId: "acc_1",
        institution: "generic",
        row
      })
    ).toBe(
      createTransactionDedupeHash({
        householdId: "hh_1",
        accountId: "acc_1",
        institution: "generic",
        row
      })
    );
  });
});
