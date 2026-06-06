import { describe, expect, it } from "vitest";
import { parseStatementInput } from "./detect";
import { createStatementInput } from "./normalize";
import { detectInternalFlow } from "./transfer-match";
import { categorizeRow } from "./category-rules";

describe("Revolut per-currency CSV parser", () => {
  const text = [
    "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance",
    "Card Payment,Current,2026-05-03 12:15:00,2026-05-03 12:15:02,Coop Zug,-42.50,0.00,CHF,COMPLETED,457.50",
    "Topup,Current,2026-05-01 09:00:00,2026-05-01 09:00:05,Payment from RUAN STEYN,500.00,0.00,CHF,COMPLETED,500.00",
    "Exchange,Current,2026-05-04 08:00:00,2026-05-04 08:00:01,Exchanged to EUR,-100.00,0.00,CHF,COMPLETED,357.50",
    "Card Payment,Current,2026-05-15 09:45:00,2026-05-15 09:45:01,Pending coffee,-3.50,0.00,CHF,PENDING,",
    "ATM,Current,2026-05-12 22:10:00,2026-05-12 22:10:05,ATM Bern,-100.00,2.00,CHF,COMPLETED,231.51"
  ].join("\n");

  it("detects Revolut, skips pending, nets fees, flags FX & top-ups", async () => {
    const parsed = await parseStatementInput({ input: createStatementInput({ fileName: "rev.csv", text }) });
    expect(parsed.institution).toBe("revolut");
    expect(parsed.parserKey).toBe("revolut-csv");
    // 5 rows in, 1 PENDING skipped => 4 emitted
    expect(parsed.rows).toHaveLength(4);
    const atm = parsed.rows.find((r) => r.description.includes("ATM"))!;
    expect(atm.amount).toBe("-102.0000"); // -100 amount minus 2.00 fee
    const topup = parsed.rows.find((r) => r.description.includes("Payment from"))!;
    const exchange = parsed.rows.find((r) => r.description.includes("Exchanged"))!;
    expect(detectInternalFlow(topup)?.kind).toBe("transfer");
    expect(detectInternalFlow(exchange)?.kind).toBe("fx");
    const coop = parsed.rows.find((r) => r.description.includes("Coop"))!;
    expect(detectInternalFlow(coop)).toBeNull();
    expect(categorizeRow(coop)).toBe("Groceries");
  });
});

describe("UBS account CSV parser", () => {
  const text = [
    "Kontonummer:;0273 00122622.40;",
    "IBAN:;CH47 0027 3273 1226 2240 T;",
    "Von:;2025-01-01;",
    "Bis:;2025-01-31;",
    "Anfangssaldo:;100.00;",
    "Schlusssaldo:;2110.10;",
    "Bewertet in:;CHF;",
    "Anzahl Transaktionen in diesem Zeitraum:;2;",
    "",
    "Abschlussdatum;Abschlusszeit;Buchungsdatum;Valutadatum;Währung;Belastung;Gutschrift;Einzelbetrag;Saldo;Transaktions-Nr.;Beschreibung1;Beschreibung2;Beschreibung3;Fussnoten;",
    '2025-01-05;;2025-01-05;2025-01-05;CHF;-33.95;;;66.05;TX1;"COOP-1119 ROTKREUZ";"Zahlung UBS TWINT";"";;',
    '2025-01-10;;2025-01-10;2025-01-10;CHF;;100.00;;166.05;TX2;"REVOLUT LTD, LONDON";"REVOLUT/RS; Instant-Zahlung";"";;'
  ].join("\n");

  it("detects UBS account, signs amounts, exposes IBAN, flags Revolut transfer", async () => {
    const parsed = await parseStatementInput({ input: createStatementInput({ fileName: "ubs.csv", text }) });
    expect(parsed.institution).toBe("ubs");
    expect(parsed.parserKey).toBe("ubs-account-csv");
    expect(parsed.accountIdentifier).toContain("CH47");
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].amount).toBe("-33.9500");
    expect(parsed.rows[1].amount).toBe("100.0000");
    expect(categorizeRow(parsed.rows[0])).toBe("Groceries");
    expect(detectInternalFlow(parsed.rows[1])?.kind).toBe("transfer"); // REVOLUT
  });
});

describe("UBS card CSV parser (Latin-1, Buchungstext/Branche)", () => {
  const text = [
    "sep=;",
    "Kontonummer;Kartennummer;Konto-/Karteninhaber;Einkaufsdatum;Buchungstext;Branche;Betrag;Originalwährung;Kurs;Währung;Belastung;Gutschrift;Buchung",
    "3255;5101;MANIESH STEYN;02.06.2026;TWINT *Bäckerei von Rotz;Bäckerei;7.50;CHF;;CHF;7.50;;03.06.2026",
    "3255;5101;MANIESH STEYN;27.05.2026;TRANSFER FROM ACCOUNT;;208.55;CHF;;CHF;;208.55;28.05.2026"
  ].join("\n");

  it("decodes Latin-1, maps Branche, flags settlement as internal", async () => {
    const input = createStatementInput({
      fileName: "card.csv",
      text,
      bytes: Buffer.from(text, "latin1")
    });
    const parsed = await parseStatementInput({ input });
    expect(parsed.institution).toBe("ubs");
    expect(parsed.parserKey).toBe("ubs-card-csv");
    expect(parsed.accountName).toBe("MANIESH STEYN");
    expect(parsed.rows).toHaveLength(2);
    const bakery = parsed.rows[0];
    expect(bakery.amount).toBe("-7.5000"); // Belastung => money out
    expect(categorizeRow(bakery)).toBe("Groceries"); // Bäckerei -> backerei
    const settlement = parsed.rows[1];
    expect(settlement.amount).toBe("208.5500"); // Gutschrift => money in
    expect(detectInternalFlow(settlement)?.kind).toBe("settlement");
  });
});
