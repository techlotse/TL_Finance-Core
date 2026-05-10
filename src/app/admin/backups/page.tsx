import { loadPublicAdminConfig } from "@/lib/admin-config";
import { AdminBackupForm } from "./admin-backup-form";

export const dynamic = "force-dynamic";

export default async function AdminBackupsPage() {
  const cfg = await loadPublicAdminConfig();
  return <AdminBackupForm initial={cfg.backupConfig} />;
}
