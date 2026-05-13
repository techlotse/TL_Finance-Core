import type { NextRequest } from "next/server";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { requireAdminApi } from "@/lib/admin-guard";
import { adminMailTestSchema } from "@/lib/schemas";
import { sendMail } from "@/lib/mailer";
import { writeAudit } from "@/lib/audit";
import { ipHashFromHeaders } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAdminApi();
    const raw = await req.text();
    const body = adminMailTestSchema.parse(raw ? JSON.parse(raw) : {});
    const to = body.to ?? ctx.user.email;

    const result = await sendMail({
      to,
      subject: "TL Finance Core SMTP test",
      text:
        `This is a TL Finance Core SMTP test email.\n\n` +
        `If you received it, password reset and email verification delivery ` +
        `can use the saved mail configuration.`
    });

    await writeAudit({
      action: "admin_mail_test",
      userId: ctx.user.id,
      resourceType: "admin_config",
      resourceId: "mailConfig",
      ipHash: ipHashFromHeaders(req.headers),
      metadata: {
        delivered: result.delivered,
        toDomain: to.split("@")[1] ?? null,
        reason: result.reason ?? null
      }
    });

    if (!result.delivered) {
      return jsonError("SMTP test email was not delivered", 502, {
        reason: result.reason ?? "send_failed"
      });
    }

    return jsonOk({ ok: true, delivered: true, to });
  } catch (err) {
    return handleApiError(err);
  }
}
