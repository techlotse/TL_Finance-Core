"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  PiggyBank,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import {
  type AiAdviceResult,
  type ClassicAdviceResult,
  type FinancialSnapshot,
  type AdviceMetric,
  type AdviceRecommendation
} from "@/lib/advice";
import {
  PRODUCT_PLANS,
  PRODUCT_TIERS,
  hasPlanAtLeast,
  type ProductTier
} from "@/lib/plans";
import { formatMoneyWithCurrency } from "@/lib/money";
import { ProductBrandMark } from "@/components/product-brand";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AdviceClient({
  tier,
  baseCurrency,
  aiConfigured,
  classicAdvice,
  snapshot
}: {
  tier: ProductTier;
  baseCurrency: string;
  aiConfigured: boolean;
  classicAdvice: ClassicAdviceResult | null;
  snapshot: FinancialSnapshot | null;
}) {
  const [aiAdvice, setAiAdvice] = useState<AiAdviceResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canUseSmart = hasPlanAtLeast(tier, "smart");
  const canUseAi = hasPlanAtLeast(tier, "ai");

  async function generateAiAdvice() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/advice/ai", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "AI advice failed");
      setAiAdvice(json.value);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI advice failed");
    } finally {
      setBusy(false);
    }
  }

  if (!canUseSmart) {
    return <OfferingCards />;
  }

  return (
    <div className="space-y-6">
      {snapshot && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {classicAdvice?.metrics.map((metric) => (
            <MetricCard key={metric.label} metric={metric} />
          ))}
        </div>
      )}

      {snapshot && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ContextCard
            icon={<ShieldCheck className="h-4 w-4" />}
            title="Emergency target"
            value={formatMoneyWithCurrency(
              snapshot.emergencyFund.targetAmount,
              baseCurrency
            )}
            detail={`${Number(snapshot.emergencyFund.currentMonths).toFixed(
              1
            )} months funded`}
          />
          <ContextCard
            icon={<AlertTriangle className="h-4 w-4" />}
            title="Job-loss mode"
            value={formatMoneyWithCurrency(
              snapshot.jobLoss.redistributableMonthlyExpenses,
              baseCurrency
            )}
            detail="Monthly expenses marked flexible or non-essential"
          />
          <ContextCard
            icon={<PiggyBank className="h-4 w-4" />}
            title="FIRE number"
            value={formatMoneyWithCurrency(
              snapshot.fire.targetInvestableAssets,
              baseCurrency
            )}
            detail={
              snapshot.fire.estimatedYearsToFire == null
                ? "Not reached within 60 years at current pace"
                : `${snapshot.fire.estimatedYearsToFire} year estimate`
            }
          />
        </div>
      )}

      {classicAdvice && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">TL Finance Smart</h2>
            <p className="text-sm text-muted-foreground">
              Classic savings, investment, retirement, job-loss, and FIRE checks.
            </p>
          </div>
          <RecommendationList recommendations={classicAdvice.recommendations} />
          <div className="flex flex-wrap gap-2">
            {classicAdvice.assumptions.map((assumption) => (
              <Badge key={assumption} variant="outline">
                {assumption}
              </Badge>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BrainCircuit className="h-4 w-4" />
              TL Finance AI
            </CardTitle>
            <CardDescription>
              OpenAI-powered reasoning over the same household snapshot.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={generateAiAdvice}
                disabled={!canUseAi || !aiConfigured || busy}
              >
                <Sparkles className="h-4 w-4" />
                {busy ? "Generating..." : "Generate AI advice"}
              </Button>
              {!canUseAi && (
                <Badge variant="warning">TL Finance AI plan required</Badge>
              )}
              {canUseAi && !aiConfigured && (
                <Badge variant="warning">Admin OpenAI key required</Badge>
              )}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
        {aiAdvice && (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">
                  {aiAdvice.summary}
                </p>
              </CardContent>
            </Card>
            <RecommendationList recommendations={aiAdvice.recommendations} />
            {aiAdvice.caveats.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {aiAdvice.caveats.map((caveat) => (
                  <Badge key={caveat} variant="outline">
                    {caveat}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function OfferingCards() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {PRODUCT_TIERS.map((tier) => {
        const plan = PRODUCT_PLANS[tier];
        return (
          <Card key={tier} className={cn("overflow-hidden", plan.accentClass)}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <ProductBrandMark tier={tier} />
                <div>
                  <CardTitle>{plan.name}</CardTitle>
                  <CardDescription>{plan.signupTitle}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Badge variant={tier === "core" ? "outline" : "secondary"}>
                {plan.priceLabel}
              </Badge>
              <p className="text-sm text-muted-foreground">
                {plan.signupDescription}
              </p>
              <ul className="space-y-1 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    {feature}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function MetricCard({ metric }: { metric: AdviceMetric }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {metric.label}
        </p>
        <p
          className={cn(
            "mt-2 text-xl font-semibold tabular",
            metric.tone === "good" && "text-success",
            metric.tone === "warning" && "text-warning",
            metric.tone === "danger" && "text-destructive"
          )}
        >
          {metric.value}
        </p>
      </CardContent>
    </Card>
  );
}

function ContextCard({
  icon,
  title,
  value,
  detail
}: {
  icon: ReactNode;
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {icon}
          {title}
        </div>
        <p className="mt-2 text-xl font-semibold tabular">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function RecommendationList({
  recommendations
}: {
  recommendations: AdviceRecommendation[];
}) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {recommendations.map((rec) => (
        <Card key={rec.id}>
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{rec.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {rec.rationale}
                </p>
              </div>
              <PriorityBadge priority={rec.priority} />
            </div>
            <p className="mt-3 text-sm">{rec.action}</p>
            {rec.monthlyImpact && (
              <p className="mt-3 text-xs text-muted-foreground">
                Monthly impact: {rec.monthlyImpact}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PriorityBadge({ priority }: { priority: AdviceRecommendation["priority"] }) {
  if (priority === "high") return <Badge variant="destructive">High</Badge>;
  if (priority === "medium") return <Badge variant="warning">Medium</Badge>;
  return <Badge variant="outline">Low</Badge>;
}
