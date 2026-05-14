export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  try {
    const url = new URL(raw, "http://local.invalid");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
