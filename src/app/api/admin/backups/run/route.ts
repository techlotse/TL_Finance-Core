import type { NextRequest } from "next/server";
import { handleApiError, jsonOk } from "@/lib/api";
import { requireAdminApi } from "@/lib/admin-guard";
import { runBackup } from "@/lib/backup-runner";
import { writeAudit } from "@/lib/audit";
import { ipHashFromHeaders } from "@/lib/auth";

/**
 * POST /api/admin/backups/run
 *
 * Admin-only manual trigger for the backup runner. Synchronous so the UI
 * can surface success/failure inline; pg_dump on a small DB completes in
 * under a few seconds. For very large DBs a future async job should take
 * over — see backup-runner.ts.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAdminApi();
    const result = await runBackup();
    await writeAudit({
      action: "admin_config_update",
      userId: ctx.user.id,
      resourceType: "backup_run",
      resourceId: result.path ?? "(none)",
      ipHash: ipHashFromHeaders(req.headers),
      metadata: {
        ok: result.ok,
        durationMs: result.durationMs,
        bytes: result.bytes,
        error: result.error
      }
    });
    return jsonOk(result);
  } catch (err) {
    return handleApiError(err);
  }
}
