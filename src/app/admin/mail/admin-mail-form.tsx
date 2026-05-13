"use client";

import { useState } from "react";
import { Send } from "lucide-react";
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

interface MailConfig {
  provider: "smtp" | "none";
  smtpHost?: string;
  smtpPort?: number;
  smtpTlsMode?: "auto" | "ssl" | "starttls" | "none";
  smtpUser?: string;
  fromName?: string;
  fromEmail?: string;
  smtpPasswordPreview: string;
  smtpPasswordSet: boolean;
}

export function AdminMailForm({ initial }: { initial: MailConfig }) {
  const [cfg, setCfg] = useState(initial);
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  async function save(): Promise<boolean> {
    setBusy(true);
    setError(null);
    setTestResult(null);
    try {
      const payload: Record<string, unknown> = {
        provider: cfg.provider,
        smtpHost: cfg.smtpHost ?? null,
        smtpPort: cfg.smtpPort ?? null,
        smtpTlsMode: cfg.smtpTlsMode ?? null,
        smtpUser: cfg.smtpUser ?? null,
        fromName: cfg.fromName ?? null,
        fromEmail: cfg.fromEmail ?? null
      };
      // Only include the password field if it was edited — sending undefined
      // leaves the sealed value untouched.
      if (newPassword.trim()) payload.smtpPassword = newPassword;
      const res = await fetch("/api/admin/config/mail", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      if (json.value) setCfg(json.value);
      setSavedAt(new Date());
      setNewPassword("");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setTestBusy(true);
    setError(null);
    setTestResult(null);
    try {
      if (newPassword.trim()) {
        throw new Error("Save the SMTP password before sending a test email.");
      }
      const res = await fetch("/api/admin/config/mail/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({})
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          json.details?.reason
            ? `Test email failed: ${json.details.reason}`
            : json.error || "Test email failed"
        );
      }
      setTestResult(`Test email sent to ${json.to}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test email failed");
    } finally {
      setTestBusy(false);
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Mail</CardTitle>
        <CardDescription>
          SMTP credentials used for password-reset emails and email
          verification. The password is sealed (AES-256-GCM) before storage —
          only the last two characters of the existing value are shown below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <FormField label="Provider" htmlFor="prov">
          <select
            id="prov"
            value={cfg.provider}
            onChange={(e) =>
              setCfg({ ...cfg, provider: e.target.value as "smtp" | "none" })
            }
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="none">None — log reset URL to server stdout</option>
            <option value="smtp">SMTP</option>
          </select>
        </FormField>

        {cfg.provider === "smtp" && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="SMTP host" htmlFor="host">
                <Input
                  id="host"
                  value={cfg.smtpHost ?? ""}
                  onChange={(e) => setCfg({ ...cfg, smtpHost: e.target.value })}
                  placeholder="smtp.example.com"
                />
              </FormField>
              <FormField label="Port" htmlFor="port">
                <Input
                  id="port"
                  type="number"
                  value={cfg.smtpPort ?? ""}
                  onChange={(e) =>
                    setCfg({ ...cfg, smtpPort: Number(e.target.value) || undefined })
                  }
                  placeholder="587"
                />
              </FormField>
            </div>
            <FormField label="TLS mode" htmlFor="tls">
              <select
                id="tls"
                value={cfg.smtpTlsMode ?? "auto"}
                onChange={(e) =>
                  setCfg({
                    ...cfg,
                    smtpTlsMode: e.target.value as MailConfig["smtpTlsMode"]
                  })
                }
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              >
                <option value="auto">Auto (465 SSL, 587 STARTTLS)</option>
                <option value="starttls">Require STARTTLS</option>
                <option value="ssl">Implicit TLS / SSL</option>
                <option value="none">No TLS</option>
              </select>
            </FormField>
            <FormField label="SMTP user" htmlFor="user">
              <Input
                id="user"
                value={cfg.smtpUser ?? ""}
                onChange={(e) => setCfg({ ...cfg, smtpUser: e.target.value })}
              />
            </FormField>
            <FormField
              label="SMTP password"
              htmlFor="pass"
              hint={
                cfg.smtpPasswordSet
                  ? `Currently set (preview: ${cfg.smtpPasswordPreview}). Leave blank to keep.`
                  : "Not currently set."
              }
            >
              <Input
                id="pass"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={cfg.smtpPasswordSet ? "•••••• (unchanged)" : "••••••"}
              />
            </FormField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="From name" htmlFor="fname">
                <Input
                  id="fname"
                  value={cfg.fromName ?? ""}
                  onChange={(e) => setCfg({ ...cfg, fromName: e.target.value })}
                  placeholder="TL Finance Core"
                />
              </FormField>
              <FormField label="From email" htmlFor="femail">
                <Input
                  id="femail"
                  type="email"
                  value={cfg.fromEmail ?? ""}
                  onChange={(e) => setCfg({ ...cfg, fromEmail: e.target.value })}
                  placeholder="no-reply@example.com"
                />
              </FormField>
            </div>
          </>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        {testResult && <p className="text-sm text-success">{testResult}</p>}
        {savedAt && (
          <p className="text-xs text-muted-foreground">
            Saved {savedAt.toLocaleTimeString()}.
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {cfg.provider === "smtp" && (
            <Button
              variant="secondary"
              onClick={sendTest}
              disabled={busy || testBusy}
            >
              <Send className="mr-2 size-4" />
              {testBusy ? "Sending…" : "Send test email"}
            </Button>
          )}
          <Button onClick={() => void save()} disabled={busy || testBusy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
