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
import { Switch } from "@/components/ui/switch";

interface AiConfig {
  enabled: boolean;
  provider: "openai";
  model: string;
  apiKeyPreview: string;
  apiKeySet: boolean;
}

export function AdminAiForm({ initial }: { initial: AiConfig }) {
  const [cfg, setCfg] = useState(initial);
  const [newKey, setNewKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        enabled: cfg.enabled,
        provider: "openai",
        model: cfg.model
      };
      if (clearKey) payload.apiKey = null;
      if (newKey.trim()) payload.apiKey = newKey.trim();

      const res = await fetch("/api/admin/config/ai", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");

      setCfg((prev) => ({
        ...prev,
        apiKeySet: clearKey ? false : newKey.trim() ? true : prev.apiKeySet,
        apiKeyPreview: clearKey ? "" : prev.apiKeyPreview
      }));
      setSavedAt(new Date());
      setNewKey("");
      setClearKey(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>AI advice</CardTitle>
        <CardDescription>
          OpenAI settings for TL Finance AI. The API key is sealed before
          storage and never returned to the browser in plaintext.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <label className="flex items-center gap-3 rounded-md border border-border bg-background p-3 text-sm">
          <Switch
            checked={cfg.enabled}
            onCheckedChange={(enabled) => setCfg({ ...cfg, enabled })}
          />
          <span>
            <span className="block font-medium">Enable OpenAI advice</span>
            <span className="block text-xs text-muted-foreground">
              Users on TL Finance AI can generate recommendations when enabled.
            </span>
          </span>
        </label>

        <FormField label="Model" htmlFor="openai-model">
          <Input
            id="openai-model"
            value={cfg.model}
            onChange={(e) => setCfg({ ...cfg, model: e.target.value })}
            placeholder="gpt-5.4-mini"
          />
        </FormField>

        <FormField
          label="OpenAI API key"
          htmlFor="openai-key"
          hint={
            cfg.apiKeySet
              ? `Currently set (preview: ${cfg.apiKeyPreview}). Leave blank to keep.`
              : "Not currently set."
          }
        >
          <Input
            id="openai-key"
            type="password"
            value={newKey}
            onChange={(e) => {
              setNewKey(e.target.value);
              if (e.target.value) setClearKey(false);
            }}
            placeholder={cfg.apiKeySet ? "sk-... (unchanged)" : "sk-..."}
          />
        </FormField>

        {cfg.apiKeySet && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch
              checked={clearKey}
              onCheckedChange={(checked) => {
                setClearKey(checked);
                if (checked) setNewKey("");
              }}
            />
            Clear stored API key on save
          </label>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        {savedAt && (
          <p className="text-xs text-muted-foreground">
            Saved {savedAt.toLocaleTimeString()}.
          </p>
        )}
        <div className="flex justify-end">
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
