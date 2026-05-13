"use client";

import { useState } from "react";
import type { PaymentConfig, PaymentTier } from "@/lib/admin-config";
import type { ProductTier } from "@/generated/prisma/client";
import { CreditCard, ExternalLink } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const TIERS: PaymentTier[] = ["core", "smart", "ai"];

export function BillingCard({
  currentTier,
  paymentConfig
}: {
  currentTier: ProductTier;
  paymentConfig: PaymentConfig;
}) {
  const [busyTier, setBusyTier] = useState<PaymentTier | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout(tier: PaymentTier) {
    setBusyTier(tier);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tier })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Checkout unavailable");
      window.location.assign(json.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout unavailable");
    } finally {
      setBusyTier(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing</CardTitle>
        <CardDescription>
          Current plan and public-alpha upgrade workflow.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <CreditCard className="icon-base h-4 w-4 text-primary" />
          <span className="font-medium">Current tier</span>
          <Badge variant="default" className="uppercase">
            {currentTier}
          </Badge>
        </div>

        {!paymentConfig.enabled || paymentConfig.provider === "none" ? (
          <p className="text-sm text-muted-foreground">
            Payments are not enabled on this instance.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {TIERS.map((tier) => {
              const cfg = paymentConfig.tiers[tier];
              const isCurrent = currentTier === tier;
              const canCheckout = cfg.enabled && !!cfg.checkoutUrl && !isCurrent;
              return (
                <div
                  key={tier}
                  className="flex min-h-44 flex-col justify-between rounded-md border border-border bg-background p-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{cfg.displayName}</p>
                      {isCurrent && <Badge variant="success">Active</Badge>}
                    </div>
                    {cfg.priceLabel && (
                      <p className="text-lg font-semibold">{cfg.priceLabel}</p>
                    )}
                    {cfg.summary && (
                      <p className="text-xs text-muted-foreground">
                        {cfg.summary}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant={canCheckout ? "default" : "outline"}
                    className="mt-4 w-full"
                    disabled={!canCheckout || busyTier === tier}
                    onClick={() => startCheckout(tier)}
                  >
                    {busyTier === tier
                      ? "Opening..."
                      : isCurrent
                        ? "Current plan"
                        : cfg.checkoutUrl
                          ? "Upgrade"
                          : "Manual"}
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {paymentConfig.billingPortalUrl && (
          <a
            href={paymentConfig.billingPortalUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm text-primary underline-offset-4 hover:underline"
          >
            Manage billing
            <ExternalLink className="icon-base h-4 w-4" />
          </a>
        )}
        {paymentConfig.supportEmail && (
          <p className="text-xs text-muted-foreground">
            Billing support: {paymentConfig.supportEmail}
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
