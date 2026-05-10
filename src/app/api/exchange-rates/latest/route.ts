import { NextRequest } from "next/server";
import { handleApiError, jsonOk } from "@/lib/api";
import { getExchangeRate } from "@/lib/exchange-rates";
import { requireSession } from "@/lib/auth";
import { assertEmailVerifiedForAppAccess } from "@/lib/auth-policy";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireSession();
    await assertEmailVerifiedForAppAccess(ctx.user);

    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (!from || !to) {
      return jsonOk(
        { error: "Missing 'from' or 'to' query parameter" },
        { status: 400 }
      );
    }
    const result = await getExchangeRate(from, to);
    return jsonOk({
      from: from.toUpperCase(),
      to: to.toUpperCase(),
      rate: result.rate.toString(),
      date: result.date.toISOString(),
      provider: result.provider,
      stale: result.stale
    });
  } catch (err) {
    return handleApiError(err);
  }
}
