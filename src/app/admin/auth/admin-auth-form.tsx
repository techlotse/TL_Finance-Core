"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { FormField } from "@/components/ui/label";

interface AuthConfig {
  signupEnabled: boolean;
  emailVerificationRequired: boolean;
  sessionTtlDays: number;
  maxFailedSignins: number;
  maxPasswordResetRequestsPerHour: number;
  maxEmailVerificationRequestsPerHour: number;
}

export function AdminAuthForm({ initial }: { initial: AuthConfig }) {
  const [cfg, setCfg] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/config/auth", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cfg)
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
        <CardTitle>Authentication</CardTitle>
        <CardDescription>
          Controls who can sign up and how sessions behave on this instance.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <SwitchRow
          title="Allow new sign-ups"
          description="When off, only existing users can sign in. Useful before going public or while migrating."
          checked={cfg.signupEnabled}
          onChange={(v) => setCfg({ ...cfg, signupEnabled: v })}
        />
        <SwitchRow
          title="Require email verification"
          description="When on, users must click a link sent to their inbox before they can use the app. Requires SMTP to be configured."
          checked={cfg.emailVerificationRequired}
          onChange={(v) => setCfg({ ...cfg, emailVerificationRequired: v })}
        />
        <FormField
          label="Session TTL (days)"
          htmlFor="ttl"
          hint="How long a single sign-in stays valid before re-authentication."
        >
          <Input
            id="ttl"
            type="number"
            min={1}
            max={365}
            value={cfg.sessionTtlDays}
            onChange={(e) =>
              setCfg({ ...cfg, sessionTtlDays: Number(e.target.value) || 1 })
            }
          />
        </FormField>
        <FormField
          label="Max failed sign-ins per hour (per IP)"
          htmlFor="maxf"
          hint="After this threshold, sign-ins from that IP are throttled."
        >
          <Input
            id="maxf"
            type="number"
            min={1}
            max={1000}
            value={cfg.maxFailedSignins}
            onChange={(e) =>
              setCfg({ ...cfg, maxFailedSignins: Number(e.target.value) || 1 })
            }
          />
        </FormField>
        <FormField
          label="Max password reset requests per hour"
          htmlFor="max-reset"
          hint="Applies per IP and prevents reset email floods."
        >
          <Input
            id="max-reset"
            type="number"
            min={1}
            max={1000}
            value={cfg.maxPasswordResetRequestsPerHour}
            onChange={(e) =>
              setCfg({
                ...cfg,
                maxPasswordResetRequestsPerHour: Number(e.target.value) || 1
              })
            }
          />
        </FormField>
        <FormField
          label="Max verification emails per hour"
          htmlFor="max-verify"
          hint="Applies per IP and user account for verification resend requests."
        >
          <Input
            id="max-verify"
            type="number"
            min={1}
            max={1000}
            value={cfg.maxEmailVerificationRequestsPerHour}
            onChange={(e) =>
              setCfg({
                ...cfg,
                maxEmailVerificationRequestsPerHour: Number(e.target.value) || 1
              })
            }
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

function SwitchRow({
  title,
  description,
  checked,
  onChange
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
