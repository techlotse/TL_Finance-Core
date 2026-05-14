import { describe, expect, it, vi } from "vitest";
import {
  isSameOriginUnsafeRequest,
  normaliseHttpOrigin,
  publicAppOrigin,
  requestOriginFromHeaders
} from "./request-origin";

describe("request origin helpers", () => {
  it("normalises only http and https origins", () => {
    expect(normaliseHttpOrigin("https://example.com/path?q=1")).toBe(
      "https://example.com"
    );
    expect(normaliseHttpOrigin("javascript:alert(1)")).toBeNull();
    expect(normaliseHttpOrigin("not a url")).toBeNull();
  });

  it("derives a safe origin from forwarded headers", () => {
    const headers = new Headers({
      host: "internal:3000",
      "x-forwarded-host": "finance.example.com",
      "x-forwarded-proto": "https"
    });
    expect(requestOriginFromHeaders(headers)).toBe("https://finance.example.com");
  });

  it("rejects unsafe host header shapes", () => {
    const headers = new Headers({
      host: "finance.example.com/evil",
      "x-forwarded-proto": "https"
    });
    expect(requestOriginFromHeaders(headers)).toBeNull();
  });

  it("prefers APP_BASE_URL when building public links", () => {
    vi.stubEnv("APP_BASE_URL", "https://public.example.com/app");
    expect(publicAppOrigin(new Headers({ host: "internal:3000" }))).toBe(
      "https://public.example.com"
    );
    vi.unstubAllEnvs();
  });

  it("checks browser unsafe requests against configured origin", () => {
    vi.stubEnv("APP_BASE_URL", "https://finance.example.com");
    expect(
      isSameOriginUnsafeRequest(
        new Headers({ origin: "https://finance.example.com" })
      )
    ).toBe(true);
    expect(
      isSameOriginUnsafeRequest(new Headers({ origin: "https://evil.test" }))
    ).toBe(false);
    vi.unstubAllEnvs();
  });
});
