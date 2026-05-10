import { NextRequest } from "next/server";
import { handleApiError, jsonOk } from "@/lib/api";
import { adminAiConfigPatchSchema } from "@/lib/schemas";
import { requireAdminApi } from "@/lib/admin-guard";
import { saveAiConfig, sealSecret, type AiConfig } from "@/lib/admin-config";
import { writeAudit } from "@/lib/audit";
import { ipHashFromHeaders } from "@/lib/auth";

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireAdminApi();
    const body = adminAiConfigPatchSchema.parse(await req.json());

    const patch: Partial<AiConfig> = {};
    if (body.enabled !== undefined) patch.enabled = body.enabled;
    if (body.provider !== undefined) patch.provider = body.provider;
    if (body.model !== undefined) patch.model = body.model;
    if (body.apiKey !== undefined) {
      patch.apiKeyCipher = sealSecret(body.apiKey) ?? null;
    }

    const next = await saveAiConfig(patch);
    const safe = { ...next, apiKeyCipher: undefined };

    await writeAudit({
      action: "admin_config_update",
      userId: ctx.user.id,
      resourceType: "admin_config",
      resourceId: "aiConfig",
      ipHash: ipHashFromHeaders(req.headers),
      metadata: {
        keys: Object.keys(body),
        apiKeyRotated: body.apiKey !== undefined && !!body.apiKey
      }
    });

    return jsonOk({ ok: true, value: safe });
  } catch (err) {
    return handleApiError(err);
  }
}
