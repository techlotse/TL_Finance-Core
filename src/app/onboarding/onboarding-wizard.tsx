"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { FormField } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Preset = "swiss" | "german" | "french" | "generic";

const PRESETS: Array<{ value: Preset; label: string; hint: string }> = [
  {
    value: "swiss",
    label: "Swiss",
    hint: "Pillar 3a, Nebenkosten, Quellensteuer, Serafe…"
  },
  {
    value: "generic",
    label: "Generic",
    hint: "Universal categories — works anywhere"
  },
  {
    value: "german",
    label: "German",
    hint: "Generic preset for now — localised version coming"
  },
  {
    value: "french",
    label: "French",
    hint: "Generic preset for now — localised version coming"
  }
];

const COMMON_CURRENCIES = ["CHF", "EUR", "USD", "GBP", "SEK", "NOK", "DKK"];

export function OnboardingWizard({ initialEmail }: { initialEmail: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [householdName, setHouseholdName] = useState(
    suggestHouseholdName(initialEmail)
  );
  const [baseCurrency, setBaseCurrency] = useState("CHF");
  const [earnerCount, setEarnerCount] = useState<1 | 2>(2);
  const [earner1, setEarner1] = useState("Person 1");
  const [earner2, setEarner2] = useState("Person 2");
  const [preset, setPreset] = useState<Preset>("swiss");

  const totalSteps = 4;
  const canNextStep0 = householdName.trim().length > 0;
  const canNextStep1 = /^[A-Z]{3}$/.test(baseCurrency);
  const canNextStep2 =
    earner1.trim().length > 0 && (earnerCount === 1 || earner2.trim().length > 0);

  async function finish() {
    setSubmitting(true);
    setError(null);
    try {
      const earners =
        earnerCount === 1
          ? [{ name: earner1.trim() }]
          : [{ name: earner1.trim() }, { name: earner2.trim() }];
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          householdName: householdName.trim(),
          baseCurrency,
          earners,
          categoryPreset: preset
        })
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not finish setup");
        setSubmitting(false);
        return;
      }
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finish setup");
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-5 space-y-5">
        <Stepper current={step} total={totalSteps} />

        {step === 0 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-medium">Name your household</h2>
              <p className="text-sm text-muted-foreground">
                You can change this later in Settings.
              </p>
            </div>
            <FormField label="Household name" htmlFor="hname">
              <Input
                id="hname"
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                placeholder="e.g. The Müller Family"
              />
            </FormField>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-medium">Choose your base currency</h2>
              <p className="text-sm text-muted-foreground">
                Forecasts and net-worth totals are reported in this currency.
                You can still hold accounts and budget items in any currency.
              </p>
            </div>
            <FormField label="Base currency" htmlFor="basecur">
              <Input
                id="basecur"
                value={baseCurrency}
                onChange={(e) => setBaseCurrency(e.target.value.toUpperCase())}
                maxLength={3}
                placeholder="CHF"
              />
            </FormField>
            <div className="flex flex-wrap gap-2">
              {COMMON_CURRENCIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setBaseCurrency(c)}
                  className={
                    "rounded-md border px-3 py-1 text-xs font-medium transition-colors " +
                    (baseCurrency === c
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-accent")
                  }
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-medium">Income earners</h2>
              <p className="text-sm text-muted-foreground">
                Tag salaries and bonuses to a person. One or two is typical.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEarnerCount(1)}
                className={
                  "flex-1 rounded-md border px-3 py-2 text-sm font-medium " +
                  (earnerCount === 1
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent")
                }
              >
                Just me
              </button>
              <button
                type="button"
                onClick={() => setEarnerCount(2)}
                className={
                  "flex-1 rounded-md border px-3 py-2 text-sm font-medium " +
                  (earnerCount === 2
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent")
                }
              >
                Two earners
              </button>
            </div>
            <FormField label="Earner 1 name" htmlFor="e1">
              <Input
                id="e1"
                value={earner1}
                onChange={(e) => setEarner1(e.target.value)}
              />
            </FormField>
            {earnerCount === 2 && (
              <FormField label="Earner 2 name" htmlFor="e2">
                <Input
                  id="e2"
                  value={earner2}
                  onChange={(e) => setEarner2(e.target.value)}
                />
              </FormField>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-medium">Pick a category preset</h2>
              <p className="text-sm text-muted-foreground">
                We&apos;ll seed a starter set of categories. You can edit any
                of them in Settings → Categories.
              </p>
            </div>
            <div className="space-y-2">
              {PRESETS.map((p) => {
                const active = preset === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPreset(p.value)}
                    className={
                      "block w-full rounded-md border p-3 text-left transition-colors " +
                      (active
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-accent")
                    }
                  >
                    <div className="font-medium text-sm">{p.label}</div>
                    <div className="text-xs text-muted-foreground">{p.hint}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-between pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || submitting}
          >
            Back
          </Button>
          {step < totalSteps - 1 ? (
            <Button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={
                (step === 0 && !canNextStep0) ||
                (step === 1 && !canNextStep1) ||
                (step === 2 && !canNextStep2)
              }
            >
              Continue
            </Button>
          ) : (
            <Button type="button" onClick={finish} disabled={submitting}>
              {submitting ? "Setting up…" : "Finish"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function suggestHouseholdName(email: string): string {
  const local = email.split("@")[0] ?? "";
  if (!local) return "My Household";
  return local
    .split(/[._-]/g)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ") + " Household";
}

function Stepper({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex gap-1.5" aria-label={`Step ${current + 1} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={
            "h-1.5 flex-1 rounded-full " +
            (i <= current ? "bg-primary" : "bg-muted")
          }
        />
      ))}
    </div>
  );
}
