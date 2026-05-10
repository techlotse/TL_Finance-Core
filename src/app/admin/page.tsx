import { prisma } from "@/lib/prisma";
import { loadPublicAdminConfig } from "@/lib/admin-config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const cfg = await loadPublicAdminConfig();
  const [userCount, sessionCount, householdCount, lastAudit] = await Promise.all([
    prisma.user.count(),
    prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
    prisma.household.count(),
    prisma.auditLog.findFirst({ orderBy: { ts: "desc" } })
  ]);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Users</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular">{userCount}</p>
          <p className="text-xs text-muted-foreground">
            Sign-ups{" "}
            {cfg.authConfig.signupEnabled ? (
              <Badge variant="success">enabled</Badge>
            ) : (
              <Badge variant="warning">disabled</Badge>
            )}
            {" · "}
            Email verification{" "}
            <Badge
              variant={
                cfg.authConfig.emailVerificationRequired ? "default" : "outline"
              }
            >
              {cfg.authConfig.emailVerificationRequired ? "required" : "optional"}
            </Badge>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Active sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular">{sessionCount}</p>
          <p className="text-xs text-muted-foreground">
            TTL {cfg.authConfig.sessionTtlDays} days
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Households</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular">{householdCount}</p>
          <p className="text-xs text-muted-foreground">Tenants on this instance.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Mail provider</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base font-medium capitalize">
            {cfg.mailConfig.provider}
          </p>
          <p className="text-xs text-muted-foreground">
            {cfg.mailConfig.provider === "smtp" && cfg.mailConfig.smtpHost
              ? `${cfg.mailConfig.smtpHost}:${cfg.mailConfig.smtpPort ?? "?"}`
              : "Not configured — password resets log to console."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Backups</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base font-medium">
            {cfg.backupConfig.enabled ? "Enabled" : "Disabled"}
          </p>
          <p className="text-xs text-muted-foreground">
            {cfg.backupConfig.enabled
              ? `${cfg.backupConfig.bucket ?? "?"} @ ${
                  cfg.backupConfig.endpoint ?? "default"
                }`
              : "No off-host backups configured."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">AI advice</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base font-medium">
            {cfg.aiConfig.enabled ? "Enabled" : "Disabled"}
          </p>
          <p className="text-xs text-muted-foreground">
            {cfg.aiConfig.apiKeySet
              ? `OpenAI model ${cfg.aiConfig.model}`
              : "OpenAI API key not configured."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Last audit event</CardTitle>
        </CardHeader>
        <CardContent>
          {lastAudit ? (
            <>
              <p className="text-base font-medium font-mono">
                {lastAudit.action}
              </p>
              <p className="text-xs text-muted-foreground">
                {lastAudit.resourceType ?? "—"} ·{" "}
                {lastAudit.ts.toISOString()}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No audit events yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
