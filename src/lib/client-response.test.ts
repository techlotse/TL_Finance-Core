import { describe, expect, it } from "vitest";
import { apiErrorMessage, readApiObject } from "./client-response";

describe("readApiObject", () => {
  it("parses JSON objects", async () => {
    const res = new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
      status: 200
    });

    await expect(readApiObject(res, "/api/test")).resolves.toEqual({ ok: true });
  });

  it("turns HTML responses into actionable errors", async () => {
    const res = new Response("<!DOCTYPE html><title>Not Found</title>", {
      headers: { "content-type": "text/html; charset=utf-8" },
      status: 404
    });

    await expect(readApiObject(res, "/api/test")).rejects.toThrow(
      "Expected JSON from /api/test, got text/html; charset=utf-8 (HTTP 404)"
    );
  });

  it("falls back when API error fields are missing", () => {
    expect(apiErrorMessage({}, "Failed")).toBe("Failed");
    expect(apiErrorMessage({ error: "Nope" }, "Failed")).toBe("Nope");
  });
});
