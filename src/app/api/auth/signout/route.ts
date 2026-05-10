import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { handleApiError, jsonOk } from "@/lib/api";
import {
  SESSION_COOKIE,
  clearSessionCookie,
  destroySessionByToken,
  ipHashFromHeaders
} from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (token) {
      await destroySessionByToken(token);
    }
    cookieStore.set(clearSessionCookie());
    await writeAudit({
      action: "signout",
      ipHash: ipHashFromHeaders(req.headers)
    });
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
