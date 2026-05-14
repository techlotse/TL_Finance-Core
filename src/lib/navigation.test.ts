import { describe, expect, it } from "vitest";
import { safeNextPath } from "./navigation";

describe("safeNextPath", () => {
  it("keeps local absolute paths", () => {
    expect(safeNextPath("/settings?tab=billing#top")).toBe(
      "/settings?tab=billing#top"
    );
  });

  it("rejects external and protocol-relative targets", () => {
    expect(safeNextPath("https://evil.test")).toBe("/");
    expect(safeNextPath("//evil.test/path")).toBe("/");
    expect(safeNextPath("javascript:alert(1)")).toBe("/");
  });
});
