"use client";

import { useState } from "react";
import type { PaymentConfig, PaymentTier } from "@/lib/admin-config";
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
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const TIERS: PaymentTier[] = ["core", "smart", "ai"];

export function AdminPaymentsForm({ initial }: { initial: PaymentConfig }) {
  const [cfg, setCfg] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        ...cfg,
        billingPortalUrl: cfg.billingPortalUrl ?? null,
        supportEmail: cfg.supportEmail ?? null,
        tiers: Object.fromEntries(
          TIERS.map((tier) => [
            tier,
            {
              ...cfg.tiers[tier],
              priceLabel: cfg.tiers[tier].priceLabel ?? null,
              summary: cfg.tiers[tier].summary ?? null,
              checkoutUrl: cfg.tiers[tier].checkoutUrl ?? null
            }
          ])
        )
      };
      const res = await fetch("/api/admin/config/payments", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setCfg(json.value);
      setSavedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>Payments</CardTitle>
        <CardDescription>
          Public alpha payment links. Entitlements still require admin review
          until v0.8 webhook fulfillment is added.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <label className="flex items-center gap-3 rounded-md border border-border bg-background p-3 text-sm">
          <Switch
            checked={cfg.enabled}
            onCheckedChange={(enabled) => setCfg({ ...cfg, enabled })}
          />
          <span>
            <span className="block font-medium">Enable payment workflow</span>
            <span className="block text-xs text-muted-foreground">
              Users see billing actions in Settings when enabled.
            </span>
          </span>
        </label>

        <FormField label="Provider" htmlFor="payment-provider">
          <Select
            id="payment-provider"
            value={cfg.provider}
            onChange={(e) =>
              setCfg({
                ...cfg,
                provider: e.target.value as PaymentConfig["provider"]
              })
            }
          >
            <option value="none">None</option>
            <option value="stripe_payment_links">Stripe Payment Links</option>
          </Select>
        </FormField>

        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Billing portal URL" htmlFor="billing-portal">
            <Input
              id="billing-portal"
              value={cfg.billingPortalUrl ?? ""}
              onChange={(e) =>
                setCfg({
                  ...cfg,
                  billingPortalUrl: e.target.value || undefined
                })
              }
              placeholder="https://billing.stripe.com/..."
            />
          </FormField>
          <FormField label="Billing support email" htmlFor="billing-support">
            <Input
              id="billing-support"
              type="email"
              value={cfg.supportEmail ?? ""}
              onChange={(e) =>
                setCfg({ ...cfg, supportEmail: e.target.value || undefined })
              }
              placeholder="billing@example.com"
            />
          </FormField>
        </div>

        <div className="space-y-4">
          {TIERS.map((tier) => {
            const tierCfg = cfg.tiers[tier];
            return (
              <div
                key={tier}
                className="space-y-3 rounded-md border border-border bg-background p-4"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium capitalize">{tier}</p>
                    <p className="text-xs text-muted-foreground">
                      {tierCfg.displayName}
                    </p>
                  </div>
                  <Switch
                    checked={tierCfg.enabled}
                    onCheckedChange={(enabled) =>
                      setCfg({
                        ...cfg,
                        tiers: {
                          ...cfg.tiers,
                          [tier]: { ...tierCfg, enabled }
                        }
                      })
                    }
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <FormField label="Display name" htmlFor={`${tier}-name`}>
                    <Input
                      id={`${tier}-name`}
                      value={tierCfg.displayName}
                      onChange={(e) =>
                        setCfg({
                          ...cfg,
                          tiers: {
                            ...cfg.tiers,
                            [tier]: { ...tierCfg, displayName: e.target.value }
                          }
                        })
                      }
                    />
                  </FormField>
                  <FormField label="Price label" htmlFor={`${tier}-price`}>
                    <Input
                      id={`${tier}-price`}
                      value={tierCfg.priceLabel ?? ""}
                      onChange={(e) =>
                        setCfg({
                          ...cfg,
                          tiers: {
                            ...cfg.tiers,
                            [tier]: {
                              ...tierCfg,
                              priceLabel: e.target.value || undefined
                            }
                          }
                        })
                      }
                      placeholder="CHF 9 / month"
                    />
                  </FormField>
                </div>

                <FormField label="Summary" htmlFor={`${tier}-summary`}>
                  <Input
                    id={`${tier}-summary`}
                    value={tierCfg.summary ?? ""}
                    onChange={(e) =>
                      setCfg({
                        ...cfg,
                        tiers: {
                          ...cfg.tiers,
                          [tier]: {
                            ...tierCfg,
                            summary: e.target.value || undefined
                          }
                        }
                      })
                    }
                  />
                </FormField>

                <FormField
                  label="Checkout URL"
                  htmlFor={`${tier}-checkout`}
                  hint="Use a hosted HTTPS payment link. Leave empty for free/manual tiers."
                >
                  <Input
                    id={`${tier}-checkout`}
                    value={tierCfg.checkoutUrl ?? ""}
                    onChange={(e) =>
                      setCfg({
                        ...cfg,
                        tiers: {
                          ...cfg.tiers,
                          [tier]: {
                            ...tierCfg,
                            checkoutUrl: e.target.value || undefined
                          }
                        }
                      })
                    }
                    placeholder="https://buy.stripe.com/..."
                  />
                </FormField>
              </div>
            );
          })}
        </div>

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
