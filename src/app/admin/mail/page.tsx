import { loadPublicAdminConfig } from "@/lib/admin-config";
import { AdminMailForm } from "./admin-mail-form";

export const dynamic = "force-dynamic";

export default async function AdminMailPage() {
  const cfg = await loadPublicAdminConfig();
  return <AdminMailForm initial={cfg.mailConfig} />;
}
