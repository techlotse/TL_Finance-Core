import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, jsonOk } from "@/lib/api";
import { requireAdminApi } from "@/lib/admin-guard";

export async function GET(req: NextRequest) {
  try {
    await requireAdminApi();
    const url = new URL(req.url);
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? "100")));
    const action = url.searchParams.get("action");

    const events = await prisma.auditLog.findMany({
      where: action ? { action } : undefined,
      orderBy: { ts: "desc" },
      take: limit,
      include: {
        user: { select: { email: true } }
      }
    });
    const householdIds = Array.from(
      new Set(events.map((e) => e.householdId).filter((x): x is string => !!x))
    );
    const households = householdIds.length
      ? await prisma.household.findMany({
          where: { id: { in: householdIds } },
          select: { id: true, name: true }
        })
      : [];
    const householdName = new Map(households.map((h) => [h.id, h.name]));

    return jsonOk(
      events.map((e) => ({
        id: e.id,
        action: e.action,
        resourceType: e.resourceType,
        resourceId: e.resourceId,
        userEmail: e.user?.email ?? null,
        householdName: e.householdId ? householdName.get(e.householdId) ?? null : null,
        ipHash: e.ipHash,
        metadata: e.metadata,
        ts: e.ts.toISOString()
      }))
    );
  } catch (err) {
    return handleApiError(err);
  }
}
