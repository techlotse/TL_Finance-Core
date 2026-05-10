/**
 * Lightweight structured logger. Emits JSON in production for log shippers
 * (pino-style schema) and a friendlier line format in development. Avoids a
 * runtime dependency to keep the container image small; swap for pino later
 * by re-exporting the same `log` interface.
 */
type Level = "debug" | "info" | "warn" | "error";

const order: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function envLevel(): Level {
  const raw = (process.env.LOG_LEVEL || "info").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return "info";
}

function emit(level: Level, msg: string, ctx?: Record<string, unknown>) {
  if (order[level] < order[envLevel()]) return;
  const record = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(ctx ?? {})
  };
  if (process.env.NODE_ENV === "production") {
    // One-line JSON — easy to ingest with Loki / GlitchTip / Datadog.
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(record));
  } else {
    const tail = ctx ? " " + JSON.stringify(ctx) : "";
    // eslint-disable-next-line no-console
    console.log(`[${record.ts}] ${level.toUpperCase()} ${msg}${tail}`);
  }
}

export const log = {
  debug: (msg: string, ctx?: Record<string, unknown>) => emit("debug", msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => emit("error", msg, ctx)
};
