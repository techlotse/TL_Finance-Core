import { NextRequest } from "next/server";
import { handleApiError, jsonOk } from "@/lib/api";
import { adminMailConfigPatchSchema } from "@/lib/schemas";
import { requireAdminApi } from "@/lib/admin-guard";
import { saveMailConfig, sealSecret, type MailConfig } from "@/lib/admin-config";
import { writeAudit } from "@/lib/audit";
import { ipHashFromHeaders } from "@/lib/auth";

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireAdminApi();
    const body = adminMailConfigPatchSchema.parse(await req.json());

    // Convert wire shape (smtpPassword: string|null|undefined) into the
    // sealed-cipher shape stored in the config row.
    const patch: Partial<MailConfig> = {};
    if (body.provider !== undefined) patch.provider = body.provider;
    if (body.smtpHost !== undefined) patch.smtpHost = body.smtpHost ?? undefined;
    if (body.smtpPort !== undefined) patch.smtpPort = body.smtpPort ?? undefined;
    if (body.smtpUser !== undefined) patch.smtpUser = body.smtpUser ?? undefined;
    if (body.fromName !== undefined) patch.fromName = body.fromName ?? undefined;
    if (body.fromEmail !== undefined) patch.fromEmail = body.fromEmail ?? undefined;
    if (body.smtpPassword !== undefined) {
      const sealed = sealSecret(body.smtpPassword);
      patch.smtpPasswordCipher = sealed ?? undefined;
    }

    const next = await saveMailConfig(patch);

    // Don't echo the cipher back over the wire — admin UI re-loads via the
    // public-safe loader.
    const safe = { ...next, smtpPasswordCipher: undefined };

    await writeAudit({
      action: "admin_config_update",
      userId: ctx.user.id,
      resourceType: "admin_config",
      resourceId: "mailConfig",
      ipHash: ipHashFromHeaders(req.headers),
      metadata: {
        keys: Object.keys(body),
        passwordRotated: body.smtpPassword !== undefined
      }
    });
    return jsonOk({ ok: true, value: safe });
  } catch (err) {
    return handleApiError(err);
  }
}
