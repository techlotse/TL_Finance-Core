import { NextRequest } from "next/server";
import { handleApiError, jsonOk } from "@/lib/api";
import { adminBackupConfigPatchSchema } from "@/lib/schemas";
import { requireAdminApi } from "@/lib/admin-guard";
import { saveBackupConfig, sealSecret, type BackupConfig } from "@/lib/admin-config";
import { writeAudit } from "@/lib/audit";
import { ipHashFromHeaders } from "@/lib/auth";

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireAdminApi();
    const body = adminBackupConfigPatchSchema.parse(await req.json());

    const patch: Partial<BackupConfig> = {};
    if (body.enabled !== undefined) patch.enabled = body.enabled;
    if (body.endpoint !== undefined) patch.endpoint = body.endpoint ?? undefined;
    if (body.region !== undefined) patch.region = body.region ?? undefined;
    if (body.bucket !== undefined) patch.bucket = body.bucket ?? undefined;
    if (body.accessKeyId !== undefined)
      patch.accessKeyId = body.accessKeyId ?? undefined;
    if (body.scheduleCron !== undefined)
      patch.scheduleCron = body.scheduleCron ?? undefined;
    if (body.secretAccessKey !== undefined) {
      const sealed = sealSecret(body.secretAccessKey);
      patch.secretAccessKeyCipher = sealed ?? undefined;
    }

    const next = await saveBackupConfig(patch);
    const safe = { ...next, secretAccessKeyCipher: undefined };

    await writeAudit({
      action: "admin_config_update",
      userId: ctx.user.id,
      resourceType: "admin_config",
      resourceId: "backupConfig",
      ipHash: ipHashFromHeaders(req.headers),
      metadata: {
        keys: Object.keys(body),
        secretRotated: body.secretAccessKey !== undefined
      }
    });
    return jsonOk({ ok: true, value: safe });
  } catch (err) {
    return handleApiError(err);
  }
}
