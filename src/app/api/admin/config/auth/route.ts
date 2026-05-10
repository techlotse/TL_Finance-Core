import { NextRequest } from "next/server";
import { handleApiError, jsonOk } from "@/lib/api";
import { adminAuthConfigPatchSchema } from "@/lib/schemas";
import { requireAdminApi } from "@/lib/admin-guard";
import { saveAuthConfig } from "@/lib/admin-config";
import { writeAudit } from "@/lib/audit";
import { ipHashFromHeaders } from "@/lib/auth";

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireAdminApi();
    const body = adminAuthConfigPatchSchema.parse(await req.json());
    const next = await saveAuthConfig(body);
    await writeAudit({
      action: "admin_config_update",
      userId: ctx.user.id,
      resourceType: "admin_config",
      resourceId: "authConfig",
      ipHash: ipHashFromHeaders(req.headers),
      metadata: { keys: Object.keys(body) }
    });
    return jsonOk({ ok: true, value: next });
  } catch (err) {
    return handleApiError(err);
  }
}
