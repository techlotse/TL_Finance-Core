import { describe, expect, it } from "vitest";
import { shouldRequireEmailVerification } from "./auth-policy";

describe("shouldRequireEmailVerification", () => {
  it("allows unverified users when verification is disabled", () => {
    expect(
      shouldRequireEmailVerification(false, { emailVerifiedAt: null })
    ).toBe(false);
  });

  it("blocks unverified users when verification is required", () => {
    expect(
      shouldRequireEmailVerification(true, { emailVerifiedAt: null })
    ).toBe(true);
  });

  it("allows verified users when verification is required", () => {
    expect(
      shouldRequireEmailVerification(true, {
        emailVerifiedAt: new Date("2026-05-02T00:00:00Z")
      })
    ).toBe(false);
  });
});
