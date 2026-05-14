const HTTP_OR_HTTPS = new Set(["http:", "https:"]);
const HOST_WITH_OPTIONAL_PORT = /^[a-z0-9.-]+(?::\d{1,5})?$/i;

function cleanHeaderValue(value: string | null | undefined): string | null {
  return value?.split(",")[0]?.trim() || null;
}

export function normaliseHttpOrigin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!HTTP_OR_HTTPS.has(url.protocol)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function configuredAppOrigin(): string | null {
  return normaliseHttpOrigin(process.env.APP_BASE_URL);
}

export function requestOriginFromHeaders(headers: Headers): string | null {
  const host = cleanHeaderValue(
    headers.get("x-forwarded-host") ?? headers.get("host")
  );
  if (!host || !HOST_WITH_OPTIONAL_PORT.test(host)) return null;

  const proto = cleanHeaderValue(headers.get("x-forwarded-proto")) ?? "https";
  if (proto !== "http" && proto !== "https") return null;
  return normaliseHttpOrigin(`${proto}://${host}`);
}

export function publicAppOrigin(headers: Headers): string {
  const configured = configuredAppOrigin();
  if (configured) return configured;
  return requestOriginFromHeaders(headers) ?? "http://localhost:3000";
}

export function isSameOriginUnsafeRequest(headers: Headers): boolean {
  const origin = normaliseHttpOrigin(headers.get("origin"));
  if (!origin) return true;

  const expected = configuredAppOrigin() ?? requestOriginFromHeaders(headers);
  return !!expected && origin === expected;
}
