import { loadPublicAdminConfig } from "@/lib/admin-config";
import { AdminAiForm } from "./admin-ai-form";

export const dynamic = "force-dynamic";

export default async function AdminAiPage() {
  const cfg = await loadPublicAdminConfig();
  return <AdminAiForm initial={cfg.aiConfig} />;
}
