import { spawn } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { createGzip } from "node:zlib";
import { saveBackupConfig, loadAdminConfig } from "./admin-config";
import { log } from "./logger";

/**
 * Local pg_dump runner.
 *
 * For v0.5.0 we ship a manual / on-demand backup that writes a compressed
 * pg_dump file to the host's /var/backups/tl-finance-core (or a config
 * override) and updates lastRunAt / lastResult on the admin config so the
 * dashboard can surface it.
 *
 * S3 upload is deliberately deferred — adding the AWS SDK to the bundle is
 * a separate trade-off from the v0.5.0 surface. The function is structured
 * so a future S3 step can hang off the same `dumpPath`.
 *
 * Requires `pg_dump` to be available on PATH inside the running container.
 * The production Docker image installs the PostgreSQL client tools for this.
 */

const DEFAULT_BACKUP_DIR = "/var/backups/tl-finance-core";

export interface BackupRunResult {
  ok: boolean;
  path?: string;
  bytes?: number;
  durationMs: number;
  error?: string;
}

export async function runBackup(): Promise<BackupRunResult> {
  const startedAt = Date.now();
  const cfg = await loadAdminConfig();
  if (!cfg.backupConfig.enabled) {
    return finish(false, "backup_disabled", undefined, undefined, startedAt);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return finish(false, "no_database_url", undefined, undefined, startedAt);
  }

  const dir = process.env.BACKUP_DIR || DEFAULT_BACKUP_DIR;
  try {
    await mkdir(dir, { recursive: true });
  } catch (err) {
    return finish(
      false,
      `mkdir_failed: ${(err as Error).message}`,
      undefined,
      undefined,
      startedAt
    );
  }

  const fileName = `tlfc-${new Date().toISOString().replace(/[:.]/g, "-")}.sql.gz`;
  const fullPath = join(dir, fileName);

  // pg_dump -> gzip -> file. Using argv + streams avoids shell quoting issues
  // with connection URLs while keeping the dump restorable into a fresh DB.
  const exitCode = await new Promise<number>((resolve) => {
    const dump = spawn(
      "pg_dump",
      ["--clean", "--no-owner", "--format=plain", databaseUrl],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    const gzip = createGzip();
    const out = createWriteStream(fullPath);
    let stderr = "";
    let dumpClosed = false;
    let outFinished = false;
    let resolved = false;
    let dumpCode = 1;

    function done(code: number) {
      if (resolved) return;
      resolved = true;
      resolve(code);
    }

    function maybeDone() {
      if (dumpClosed && outFinished) done(dumpCode);
    }

    dump.stdout.pipe(gzip).pipe(out);
    dump.stderr.on("data", (d) => {
      stderr += String(d);
    });
    gzip.on("error", (err) => {
      log.error("backup runner: gzip failed", { err: err.message });
      dump.kill();
      done(1);
    });
    out.on("finish", () => {
      outFinished = true;
      maybeDone();
    });
    out.on("error", (err) => {
      log.error("backup runner: write failed", { err: err.message });
      dump.kill();
      done(1);
    });
    dump.on("close", (code) => {
      dumpClosed = true;
      dumpCode = code ?? 1;
      if (code !== 0) {
        log.error("backup runner: pg_dump failed", {
          code,
          stderr: stderr.slice(0, 1000)
        });
      }
      maybeDone();
    });
    dump.on("error", (err) => {
      log.error("backup runner: spawn failed", { err: err.message });
      done(1);
    });
  });

  if (exitCode !== 0) {
    return finish(false, "pg_dump_failed", undefined, undefined, startedAt);
  }

  let bytes: number | undefined;
  try {
    const s = await stat(fullPath);
    bytes = s.size;
  } catch {
    /* ignore */
  }

  return finish(true, undefined, fullPath, bytes, startedAt);
}

async function finish(
  ok: boolean,
  error: string | undefined,
  path: string | undefined,
  bytes: number | undefined,
  startedAt: number
): Promise<BackupRunResult> {
  const durationMs = Date.now() - startedAt;
  const out: BackupRunResult = { ok, durationMs };
  if (path) out.path = path;
  if (bytes !== undefined) out.bytes = bytes;
  if (error) out.error = error;

  // Persist to the admin config so the dashboard surfaces it.
  await saveBackupConfig({
    lastRunAt: new Date().toISOString(),
    lastResult: ok ? "ok" : "error"
  });

  log.info("backup runner: finished", { ...out });
  return out;
}
