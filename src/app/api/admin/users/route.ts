import { handleApiError, jsonOk } from "@/lib/api";
import { adminUserAccessSelect, toAdminUserAccess } from "@/lib/admin-users";
import { requireAdminApi } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await requireAdminApi();
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: adminUserAccessSelect
    });
    return jsonOk({ ok: true, users: users.map(toAdminUserAccess) });
  } catch (err) {
    return handleApiError(err);
  }
}
