import Link from "next/link";
import { requireAdminPageSession } from "@/lib/page-auth";
import { AdminSubnav } from "./admin-subnav";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin - TL Finance Core"
};

export default async function AdminLayout({
  children
}: {
  children: React.ReactNode;
}) {
  await requireAdminPageSession("/admin");

  return (
    <div className="space-y-6">
      <header className="space-y-2 border-b border-border pb-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          SaaS administration
        </p>
        <h1 className="text-2xl font-semibold">Admin console</h1>
        <p className="text-sm text-muted-foreground">
          Instance-wide configuration. Visible only to admin-role accounts.{" "}
          <Link href="/" className="underline">
            Return to app
          </Link>
        </p>
      </header>
      <AdminSubnav />
      <div>{children}</div>
    </div>
  );
}
