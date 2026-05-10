import { loadPublicAdminConfig } from "@/lib/admin-config";
import { AdminAuthForm } from "./admin-auth-form";

export const dynamic = "force-dynamic";

export default async function AdminAuthPage() {
  const cfg = await loadPublicAdminConfig();
  return <AdminAuthForm initial={cfg.authConfig} />;
}
