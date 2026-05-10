import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { getSession } from "@/lib/auth";

export async function GET() {
  try {
    const ctx = await getSession();
    if (!ctx) return jsonError("Not authenticated", 401);
    return jsonOk({
      user: {
        id: ctx.user.id,
        email: ctx.user.email,
        role: ctx.user.role,
        emailVerifiedAt: ctx.user.emailVerifiedAt
      },
      household: ctx.membership
        ? {
            id: ctx.membership.household.id,
            name: ctx.membership.household.name,
            baseCurrency: ctx.membership.household.baseCurrency,
            role: ctx.membership.role
          }
        : null
    });
  } catch (err) {
    return handleApiError(err);
  }
}
