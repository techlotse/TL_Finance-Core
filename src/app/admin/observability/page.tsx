import { prisma } from "@/lib/prisma";
import { loadPublicAdminConfig } from "@/lib/admin-config";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AdminObservabilityForm } from "./admin-observability-form";

export const dynamic = "force-dynamic";

export default async function AdminObservabilityPage() {
  const cfg = await loadPublicAdminConfig();
  const events = await prisma.auditLog.findMany({
    orderBy: { ts: "desc" },
    take: 50,
    include: {
      user: { select: { email: true } }
    }
  });
  // Resolve household names in a separate batch — AuditLog has a nullable
  // householdId but no relation in the schema, so we look them up by id.
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

  return (
    <div className="space-y-6">
      <AdminObservabilityForm initial={cfg.observability} />

      <Card>
        <CardHeader>
          <CardTitle>Recent audit events</CardTitle>
          <CardDescription>
            Most recent 50 entries. The audit log is append-only and retained
            per the policy above.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No events have been recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>When</TH>
                    <TH>Action</TH>
                    <TH>Resource</TH>
                    <TH>User</TH>
                    <TH>Household</TH>
                    <TH>IP</TH>
                  </TR>
                </THead>
                <TBody>
                  {events.map((e) => (
                    <TR key={e.id}>
                      <TD className="font-mono text-xs">
                        {e.ts.toISOString().replace("T", " ").slice(0, 19)}
                      </TD>
                      <TD>
                        <Badge variant={badgeVariant(e.action)}>{e.action}</Badge>
                      </TD>
                      <TD className="text-xs">
                        {e.resourceType ?? "—"}
                        {e.resourceId ? (
                          <span className="text-muted-foreground">
                            {" "}
                            · {e.resourceId.slice(0, 8)}
                          </span>
                        ) : null}
                      </TD>
                      <TD className="text-xs">{e.user?.email ?? "—"}</TD>
                      <TD className="text-xs">
                        {e.householdId ? (householdName.get(e.householdId) ?? "—") : "—"}
                      </TD>
                      <TD className="text-xs font-mono text-muted-foreground">
                        {e.ipHash ?? "—"}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function badgeVariant(action: string) {
  if (action.includes("fail")) return "destructive" as const;
  if (action.startsWith("delete") || action === "soft_delete")
    return "warning" as const;
  if (action.startsWith("admin_")) return "default" as const;
  return "outline" as const;
}
