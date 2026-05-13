import { loadPublicAdminConfig } from "@/lib/admin-config";
import { AdminPaymentsForm } from "./admin-payments-form";

export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage() {
  const cfg = await loadPublicAdminConfig();
  return <AdminPaymentsForm initial={cfg.paymentConfig} />;
}
