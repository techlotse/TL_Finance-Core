export type ApiObject = Record<string, unknown>;

function previewText(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 160);
}

/**
 * Parse an API response that should be JSON, but fail with a useful message
 * when a proxy, auth redirect, or missing route returns HTML instead.
 */
export async function readApiObject(res: Response, path: string): Promise<ApiObject> {
  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();

  if (!text) return {};

  if (!contentType.toLowerCase().includes("application/json")) {
    const preview = previewText(text);
    throw new Error(
      `Expected JSON from ${path}, got ${contentType || "unknown content type"} ` +
        `(HTTP ${res.status}).${preview ? ` Response starts: ${preview}` : ""}`
    );
  }

  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? (parsed as ApiObject) : {};
  } catch {
    throw new Error(`Invalid JSON from ${path} (HTTP ${res.status}).`);
  }
}

export function apiErrorMessage(body: ApiObject, fallback: string): string {
  const error = body.error;
  return typeof error === "string" && error ? error : fallback;
}
