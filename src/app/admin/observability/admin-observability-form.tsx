"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/label";

interface ObservabilityConfig {
  logLevel: "debug" | "info" | "warn" | "error";
  sentryDsn?: string;
  retainAuditDays?: number;
}

export function AdminObservabilityForm({
  initial
}: {
  initial: ObservabilityConfig;
}) {
  const [cfg, setCfg] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/config/observability", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          logLevel: cfg.logLevel,
          sentryDsn: cfg.sentryDsn ?? null,
          retainAuditDays: cfg.retainAuditDays ?? null
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setSavedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Observability</CardTitle>
        <CardDescription>
          Logging verbosity, optional error reporting, and audit-log retention.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <FormField label="Log level" htmlFor="ll">
          <select
            id="ll"
            value={cfg.logLevel}
            onChange={(e) =>
              setCfg({
                ...cfg,
                logLevel: e.target.value as ObservabilityConfig["logLevel"]
              })
            }
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="debug">debug — chatty, dev only</option>
            <option value="info">info — default</option>
            <option value="warn">warn — quieter</option>
            <option value="error">error — only failures</option>
          </select>
        </FormField>

        <FormField
          label="Sentry / GlitchTip DSN"
          htmlFor="sentry"
          hint="Optional. When set, server-side errors are forwarded as well as logged."
        >
          <Input
            id="sentry"
            value={cfg.sentryDsn ?? ""}
            onChange={(e) => setCfg({ ...cfg, sentryDsn: e.target.value })}
            placeholder="https://abc@glitchtip.example.com/1"
          />
        </FormField>

        <FormField
          label="Audit log retention (days)"
          htmlFor="ret"
          hint="Older entries are pruned by the daily cleanup job. Leave blank to keep forever."
        >
          <Input
            id="ret"
            type="number"
            min={1}
            max={3650}
            value={cfg.retainAuditDays ?? ""}
            onChange={(e) =>
              setCfg({
                ...cfg,
                retainAuditDays: e.target.value
                  ? Number(e.target.value)
                  : undefined
              })
            }
            placeholder="365"
          />
        </FormField>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {savedAt && (
          <p className="text-xs text-muted-foreground">
            Saved {savedAt.toLocaleTimeString()}.
          </p>
        )}
        <div className="flex justify-end">
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
