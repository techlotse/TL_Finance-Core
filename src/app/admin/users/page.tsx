import { adminUserAccessSelect, toAdminUserAccess } from "@/lib/admin-users";
import { prisma } from "@/lib/prisma";
import { AdminUsersTable } from "./admin-users-table";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const users = await prisma.user.findMany({
    orderBy: [{ createdAt: "desc" }],
    take: 200,
    select: adminUserAccessSelect
  });

  return <AdminUsersTable initialUsers={users.map(toAdminUserAccess)} />;
}
