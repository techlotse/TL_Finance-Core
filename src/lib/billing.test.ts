import { describe, expect, it } from "vitest";
import { buildHostedCheckoutUrl, stripeClientReference } from "./billing";

describe("billing checkout URLs", () => {
  it("adds Stripe Payment Link reconciliation parameters without dropping existing params", () => {
    const url = new URL(
      buildHostedCheckoutUrl({
        baseUrl: "https://buy.stripe.com/test_123?locale=de",
        userId: "user-123",
        email: "alice@example.test",
        tier: "smart"
      })
    );

    expect(url.origin + url.pathname).toBe("https://buy.stripe.com/test_123");
    expect(url.searchParams.get("locale")).toBe("de");
    expect(url.searchParams.get("prefilled_email")).toBe("alice@example.test");
    expect(url.searchParams.get("client_reference_id")).toBe("user_user-123_smart");
    expect(url.searchParams.get("utm_source")).toBe("tl_finance_core");
    expect(url.searchParams.get("utm_campaign")).toBe("upgrade_smart");
  });

  it("sanitizes client references for Stripe Payment Link URL parameters", () => {
    expect(
      stripeClientReference({
        userId: "user:with/slashes and spaces",
        tier: "ai"
      })
    ).toBe("user_user_with_slashes_and_spaces_ai");
  });
});
