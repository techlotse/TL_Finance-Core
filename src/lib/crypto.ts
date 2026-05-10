import * as crypto from "crypto";

/**
 * Read APP_SECRET lazily so this module can be imported during `next build`
 * (which runs in NODE_ENV=production but without any runtime secret bound).
 * The strict length check only fires when seal/open are actually invoked —
 * any mutation that needs to round-trip a sealed secret will then surface
 * the misconfiguration loudly, but route-collection at build time stays quiet.
 */
function readAppSecret(): string {
  return process.env.APP_SECRET || "";
}

function assertProductionSecret(secret: string): void {
  if (process.env.NODE_ENV === "production" && secret.length < 32) {
    throw new Error(
      "APP_SECRET environment variable must be at least 32 characters in production"
    );
  }
}

/**
 * Derive the symmetric key used to seal admin-config secrets. Hashing the
 * APP_SECRET keeps the key length stable regardless of how the secret is
 * provided (hex, base64, passphrase). The dev fallback exists only so local
 * test runs without `.env` do not crash; sealed payloads written there will
 * not roundtrip in production by design.
 */
function getKey(): Buffer {
  const secret = readAppSecret();
  assertProductionSecret(secret);
  if (!secret) {
    return crypto.createHash("sha256").update("dev-only-app-secret").digest();
  }
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Seal a string with AES-256-GCM. Returns "v1.iv.tag.ciphertext" with each
 * segment base64url-encoded. The version prefix lets us rotate the format
 * without breaking existing rows.
 */
export function seal(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return `v1.${b64u(iv)}.${b64u(tag)}.${b64u(encrypted)}`;
}

/** Open a sealed payload. Throws on tamper / wrong key / unknown version. */
export function open(payload: string): string {
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Sealed payload format is not recognised");
  }
  const iv = b64uDecode(parts[1]);
  const tag = b64uDecode(parts[2]);
  const ct = b64uDecode(parts[3]);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/** Same as `open` but returns null on any failure rather than throwing. */
export function tryOpen(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try {
    return open(payload);
  } catch {
    return null;
  }
}

function b64u(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function b64uDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

/** SHA-256 hex digest. Used for session tokens and IP hashing. */
export function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

/** Cryptographically-random base64url token. Default 32 bytes ≈ 256 bits. */
export function randomToken(bytes = 32): string {
  return b64u(crypto.randomBytes(bytes));
}

/** Constant-time string comparison for token hashes etc. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
