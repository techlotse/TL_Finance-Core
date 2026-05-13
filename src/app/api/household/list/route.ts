import { handleApiError, jsonOk } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { assertEmailVerifiedForAppAccess } from "@/lib/auth-policy";

export async function GET() {
  try {
    const ctx = await requireSession();
    await assertEmailVerifiedForAppAccess(ctx.user);

    return jsonOk({
      ok: true,
      activeMembershipId: ctx.membership?.id ?? null,
      memberships: ctx.memberships.map((m) => ({
        id: m.id,
        householdId: m.householdId,
        householdName: m.household.name,
        baseCurrency: m.household.baseCurrency,
        role: m.role
      }))
    });
  } catch (err) {
    return handleApiError(err);
  }
}
