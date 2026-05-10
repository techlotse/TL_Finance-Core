import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { OwnershipError } from "./ownership";
import { log } from "./logger";

/**
 * Wrap a JSON response with a consistent shape. Prisma `Decimal` values are
 * stringified to avoid precision loss across the network boundary.
 */
export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function jsonError(message: string, status = 400, extra?: unknown) {
  return NextResponse.json(
    { error: message, details: extra ?? null },
    { status }
  );
}

interface HttpLikeError extends Error {
  status?: number;
}

/**
 * Convert thrown errors into a 4xx/5xx response with no DB internals leaked.
 * Order: explicit shapes (Zod, OwnershipError, status-tagged Error) first,
 * then heuristic Prisma message matches, then a generic 500.
 */
export function handleApiError(err: unknown) {
  if (err instanceof ZodError) {
    return jsonError("Validation failed", 422, err.flatten());
  }
  if (err instanceof OwnershipError) {
    return jsonError(err.message, err.status);
  }
  if (err instanceof Error) {
    const tagged = err as HttpLikeError;
    if (
      typeof tagged.status === "number" &&
      tagged.status >= 400 &&
      tagged.status < 600
    ) {
      return jsonError(err.message || "Request failed", tagged.status);
    }
    if (/Unique constraint failed/i.test(err.message)) {
      return jsonError("Resource already exists", 409);
    }
    if (/Record to update not found|No record/i.test(err.message)) {
      return jsonError("Resource not found", 404);
    }
    log.error("api unhandled error", { msg: err.message, stack: err.stack });
    const msg =
      process.env.NODE_ENV === "production"
        ? "Server error"
        : (err.message || "Server error");
    return jsonError(msg, 500);
  }
  log.error("api unknown error", { err: String(err) });
  return jsonError("Unknown error", 500);
}

/** Decimals from Prisma stringify by default; explicitly toJSON-ing them. */
export function serialize<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => {
      if (v && typeof v === "object" && "toFixed" in v && typeof (v as { toFixed: unknown }).toFixed === "function") {
        return (v as { toString(): string }).toString();
      }
      return v;
    })
  ) as T;
}
