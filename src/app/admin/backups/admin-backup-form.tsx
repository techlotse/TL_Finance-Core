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
import { Switch } from "@/components/ui/switch";
import { FormField } from "@/components/ui/label";

interface BackupConfig {
  enabled: boolean;
  endpoint?: string;
  region?: string;
  bucket?: string;
  accessKeyId?: string;
  scheduleCron?: string;
  lastRunAt?: string;
  lastResult?: "ok" | "error";
  secretAccessKeyPreview: string;
  secretAccessKeySet: boolean;
}

export function AdminBackupForm({ initial }: { initial: BackupConfig }) {
  const [cfg, setCfg] = useState(initial);
  const [newSecret, setNewSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [runResult, setRunResult] = useState<{
    ok: boolean;
    path?: string;
    bytes?: number;
    error?: string;
  } | null>(null);
  const [running, setRunning] = useState(false);

  async function runNow() {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await fetch("/api/admin/backups/run", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Backup failed");
      setRunResult({
        ok: json.ok,
        path: json.path,
        bytes: json.bytes,
        error: json.error
      });
    } catch (err) {
      setRunResult({
        ok: false,
        error: err instanceof Error ? err.message : "Backup failed"
      });
    } finally {
      setRunning(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        enabled: cfg.enabled,
        endpoint: cfg.endpoint ?? null,
        region: cfg.region ?? null,
        bucket: cfg.bucket ?? null,
        accessKeyId: cfg.accessKeyId ?? null,
        scheduleCron: cfg.scheduleCron ?? null
      };
      if (newSecret.trim()) payload.secretAccessKey = newSecret;
      const res = await fetch("/api/admin/config/backup", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setSavedAt(new Date());
      setNewSecret("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Off-host backups</CardTitle>
        <CardDescription>
          Periodically push an encrypted database snapshot to any
          S3-compatible object store (AWS, MinIO, Backblaze B2, R2, Wasabi…).
          Credentials are sealed (AES-256-GCM) before storage.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Enabled</p>
            <p className="text-xs text-muted-foreground">
              When on, the configured schedule runs <code>pg_dump</code> and
              uploads it to the bucket below.
            </p>
          </div>
          <Switch
            checked={cfg.enabled}
            onCheckedChange={(v) => setCfg({ ...cfg, enabled: v })}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            label="Endpoint"
            htmlFor="ep"
            hint="Leave blank for AWS S3."
          >
            <Input
              id="ep"
              value={cfg.endpoint ?? ""}
              onChange={(e) => setCfg({ ...cfg, endpoint: e.target.value })}
              placeholder="https://s3.eu-central-003.backblazeb2.com"
            />
          </FormField>
          <FormField label="Region" htmlFor="region">
            <Input
              id="region"
              value={cfg.region ?? ""}
              onChange={(e) => setCfg({ ...cfg, region: e.target.value })}
              placeholder="eu-central-1"
            />
          </FormField>
          <FormField label="Bucket" htmlFor="bucket">
            <Input
              id="bucket"
              value={cfg.bucket ?? ""}
              onChange={(e) => setCfg({ ...cfg, bucket: e.target.value })}
              placeholder="tl-finance-core-backups"
            />
          </FormField>
          <FormField label="Schedule (cron)" htmlFor="cron" hint="UTC.">
            <Input
              id="cron"
              value={cfg.scheduleCron ?? ""}
              onChange={(e) => setCfg({ ...cfg, scheduleCron: e.target.value })}
              placeholder="0 3 * * *"
            />
          </FormField>
          <FormField label="Access key id" htmlFor="akid">
            <Input
              id="akid"
              value={cfg.accessKeyId ?? ""}
              onChange={(e) => setCfg({ ...cfg, accessKeyId: e.target.value })}
            />
          </FormField>
          <FormField
            label="Secret access key"
            htmlFor="sak"
            hint={
              cfg.secretAccessKeySet
                ? `Currently set (preview: ${cfg.secretAccessKeyPreview}). Leave blank to keep.`
                : "Not currently set."
            }
          >
            <Input
              id="sak"
              type="password"
              value={newSecret}
              onChange={(e) => setNewSecret(e.target.value)}
              placeholder={cfg.secretAccessKeySet ? "•••••• (unchanged)" : "••••••"}
            />
          </FormField>
        </div>

        {cfg.lastRunAt && (
          <p className="text-xs text-muted-foreground">
            Last run: {cfg.lastRunAt} ({cfg.lastResult ?? "unknown"})
          </p>
        )}

        {/* Manual trigger — runs pg_dump on the host. Useful while no
            scheduler is wired up yet. Off-host upload is a follow-up. */}
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/20 p-3">
          <div className="flex-1 text-xs text-muted-foreground">
            Run a backup now using <code>pg_dump</code> on the app container
            host. Requires <code>pg_dump</code> on the runtime image PATH.
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={runNow}
            disabled={running || !cfg.enabled}
          >
            {running ? "Running…" : "Run backup now"}
          </Button>
        </div>
        {runResult && (
          <p
            className={
              runResult.ok
                ? "text-xs text-success"
                : "text-xs text-destructive"
            }
          >
            {runResult.ok
              ? `Backup written to ${runResult.path}${
                  runResult.bytes
                    ? " (" + Math.round(runResult.bytes / 1024) + " KB)"
                    : ""
                }`
              : `Backup failed: ${runResult.error ?? "unknown"}`}
          </p>
        )}

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
