"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { FormField } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProductBrandMark } from "@/components/product-brand";
import {
  PRODUCT_PLANS,
  PRODUCT_TIERS,
  type ProductTier
} from "@/lib/plans";
import { cn } from "@/lib/utils";

export function SignUpForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [productTier, setProductTier] = useState<ProductTier>("core");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 10) {
      setError("Password must be at least 10 characters");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, productTier })
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Sign-up failed");
        setSubmitting(false);
        return;
      }
      router.replace(typeof json.next === "string" ? json.next : "/onboarding");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-up failed");
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-2">
            {PRODUCT_TIERS.map((tier) => {
              const plan = PRODUCT_PLANS[tier];
              const selected = tier === productTier;
              return (
                <button
                  key={tier}
                  type="button"
                  onClick={() => setProductTier(tier)}
                  className={cn(
                    "flex min-h-24 w-full items-start gap-3 rounded-lg border bg-background p-3 text-left transition-colors",
                    selected
                      ? "border-primary ring-2 ring-primary/30"
                      : "border-border hover:bg-accent"
                  )}
                  aria-pressed={selected}
                >
                  <ProductBrandMark tier={tier} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{plan.name}</span>
                      <Badge
                        variant={tier === "core" ? "outline" : "secondary"}
                        className="shrink-0"
                      >
                        {plan.priceLabel}
                      </Badge>
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {plan.signupDescription}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <FormField label="Email" htmlFor="signup-email">
            <Input
              id="signup-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </FormField>
          <FormField
            label="Password"
            htmlFor="signup-password"
            hint="At least 10 characters."
          >
            <Input
              id="signup-password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </FormField>
          <FormField label="Confirm password" htmlFor="signup-confirm">
            <Input
              id="signup-confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </FormField>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Creating account…" : "Create account"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
