import { NextRequest } from "next/server";
import { handleApiError, jsonOk } from "@/lib/api";
import { adminObservabilityConfigPatchSchema } from "@/lib/schemas";
import { requireAdminApi } from "@/lib/admin-guard";
import {
  saveObservabilityConfig,
  type ObservabilityConfig
} from "@/lib/admin-config";
import { writeAudit } from "@/lib/audit";
import { ipHashFromHeaders } from "@/lib/auth";

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireAdminApi();
    const body = adminObservabilityConfigPatchSchema.parse(await req.json());

    const patch: Partial<ObservabilityConfig> = {};
    if (body.logLevel !== undefined) patch.logLevel = body.logLevel;
    if (body.sentryDsn !== undefined) patch.sentryDsn = body.sentryDsn ?? undefined;
    if (body.retainAuditDays !== undefined)
      patch.retainAuditDays = body.retainAuditDays ?? undefined;

    const next = await saveObservabilityConfig(patch);
    await writeAudit({
      action: "admin_config_update",
      userId: ctx.user.id,
      resourceType: "admin_config",
      resourceId: "observability",
      ipHash: ipHashFromHeaders(req.headers),
      metadata: { keys: Object.keys(body) }
    });
    return jsonOk({ ok: true, value: next });
  } catch (err) {
    return handleApiError(err);
  }
}
