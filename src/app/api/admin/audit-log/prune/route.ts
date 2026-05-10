import type { NextRequest } from "next/server";
import { handleApiError, jsonOk } from "@/lib/api";
import { requireAdminApi } from "@/lib/admin-guard";
import { pruneAuditLog } from "@/lib/audit-retention";
import { writeAudit } from "@/lib/audit";
import { ipHashFromHeaders } from "@/lib/auth";

/**
 * Manual trigger for the audit-log pruning job. Useful while we don't yet
 * have a scheduler in place; once we do, the same helper runs from cron.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAdminApi();
    const result = await pruneAuditLog();
    await writeAudit({
      action: "admin_config_update",
      userId: ctx.user.id,
      resourceType: "audit_log",
      resourceId: "prune",
      ipHash: ipHashFromHeaders(req.headers),
      metadata: result
    });
    return jsonOk(result);
  } catch (err) {
    return handleApiError(err);
  }
}
