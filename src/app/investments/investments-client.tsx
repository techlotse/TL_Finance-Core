"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { InvestmentProjectionChart } from "@/components/charts/dashboard-charts";
import { formatMoney, formatPercent } from "@/lib/money";

type Frequency = "monthly" | "quarterly" | "yearly";

export interface ProjectionRow {
  id: string;
  name: string;
  startingCapital: string;
  currency: string;
  recurringContribution: string;
  contributionFrequency: Frequency;
  expectedAnnualReturn: string;
  annualFeeDrag: string;
  inflationRate: string;
  horizonYears: number;
  account: { id: string; name: string } | null;
}

export interface AccountOption {
  id: string;
  name: string;
}

export interface InvestmentAccountRow {
  id: string;
  name: string;
  institution: string | null;
  expectedAnnualReturn: string | null;
  monthlyManagementCost: string | null;
  currencies: { currency: string; currentBalance: string }[];
}

export interface ResultPayload {
  id: string;
  name: string;
  currency: string;
  summary: {
    totalContributions: string;
    finalNominal: string;
    finalReal: string;
    totalReturn: string;
  };
  points: {
    year: number;
    monthsElapsed: number;
    contributions: string;
    nominal: string;
    real: string;
  }[];
}

export function InvestmentsClient({
  initialProjections,
  accounts,
  investmentAccounts
}: {
  initialProjections: ProjectionRow[];
  accounts: AccountOption[];
  investmentAccounts: InvestmentAccountRow[];
}) {
  const router = useRouter();
  const [projections, setProjections] =
    React.useState<ProjectionRow[]>(initialProjections);
  const [editing, setEditing] = React.useState<ProjectionRow | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [results, setResults] = React.useState<Record<string, ResultPayload>>(
    {}
  );

  React.useEffect(() => {
    // Lazily fetch results for each projection in parallel.
    let cancelled = false;
    Promise.all(
      projections.map(async (p) => {
        const res = await fetch(`/api/investment-projections/${p.id}/result`);
        if (!res.ok) return null;
        const data = (await res.json()) as ResultPayload;
        return data;
      })
    ).then((fetched) => {
      if (cancelled) return;
      const next: Record<string, ResultPayload> = {};
      for (const r of fetched) if (r) next[r.id] = r;
      setResults(next);
    });
    return () => {
      cancelled = true;
    };
  }, [projections]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this projection?")) return;
    await fetch(`/api/investment-projections/${id}`, { method: "DELETE" });
    setProjections((prev) => prev.filter((p) => p.id !== id));
    router.refresh();
  }

  return (
    <>
      {investmentAccounts.length > 0 && (
        <div className="mb-6 space-y-4">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Linked investment accounts
          </h2>
          {investmentAccounts.map((a) => (
            <InvestmentAccountCard key={a.id} account={a} />
          ))}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Synthetic projections
        </h2>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> New projection
        </Button>
      </div>

      {projections.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            No projections yet. Model a long-term investment to see nominal and
            inflation-adjusted growth.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {projections.map((p) => {
            const result = results[p.id];
            return (
              <Card key={p.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <div>
                    <CardTitle>{p.name}</CardTitle>
                    <CardDescription>
                      {p.horizonYears} years · expected return{" "}
                      {formatPercent(p.expectedAnnualReturn)} · fee{" "}
                      {formatPercent(p.annualFeeDrag)} · inflation{" "}
                      {formatPercent(p.inflationRate)}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditing(p)}
                      aria-label="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(p.id)}
                      aria-label="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Stat label="Starting capital">
                      {formatMoney(p.startingCapital, p.currency)} {p.currency}
                    </Stat>
                    <Stat
                      label={`Contribution (${p.contributionFrequency})`}
                    >
                      {formatMoney(p.recurringContribution, p.currency)}{" "}
                      {p.currency}
                    </Stat>
                    {result && (
                      <>
                        <Stat label="Final nominal">
                          {formatMoney(
                            result.summary.finalNominal,
                            p.currency
                          )}{" "}
                          {p.currency}
                        </Stat>
                        <Stat label="Final real (inflation-adjusted)">
                          {formatMoney(result.summary.finalReal, p.currency)}{" "}
                          {p.currency}
                        </Stat>
                      </>
                    )}
                  </div>
                  <div className="mt-4">
                    {result ? (
                      <InvestmentProjectionChart
                        data={result.points}
                        currency={p.currency}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Calculating projection…
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {(creating || editing) && (
        <ProjectionFormDialog
          open={creating || editing !== null}
          existing={editing}
          accounts={accounts}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={(saved) => {
            if (editing) {
              setProjections((prev) =>
                prev.map((p) => (p.id === saved.id ? saved : p))
              );
            } else {
              setProjections((prev) => [saved, ...prev]);
            }
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function Stat({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-semibold tabular">{children}</p>
    </div>
  );
}

/**
 * Render a real investment-type bank account with its projection. Pulls
 * /api/accounts/[id]/projection on mount so the same chart / summary
 * components work as for synthetic projections.
 */
function InvestmentAccountCard({
  account
}: {
  account: InvestmentAccountRow;
}) {
  const [horizon, setHorizon] = React.useState(25);
  const [data, setData] = React.useState<ResultPayload | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/accounts/${account.id}/projection?horizonYears=${horizon}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Failed (${res.status})`);
        }
        return (await res.json()) as ResultPayload;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [account.id, horizon]);

  const dominantCurrency = account.currencies[0]?.currency ?? "—";
  const totalBalance = account.currencies.reduce(
    (acc, c) => acc + Number(c.currentBalance),
    0
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>{account.name}</CardTitle>
          <CardDescription>
            {account.institution ?? "—"} · expected return{" "}
            {account.expectedAnnualReturn
              ? formatPercent(account.expectedAnnualReturn)
              : "—"}{" "}
            · monthly cost{" "}
            {account.monthlyManagementCost
              ? `${formatMoney(account.monthlyManagementCost, dominantCurrency)} ${dominantCurrency}`
              : "—"}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">
            Horizon
            <Select
              value={String(horizon)}
              onChange={(e) => setHorizon(Number(e.target.value))}
              className="ml-2 inline-block w-24"
            >
              {[5, 10, 15, 20, 25, 30, 40].map((y) => (
                <option key={y} value={y}>
                  {y}y
                </option>
              ))}
            </Select>
          </label>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Current balance">
            {formatMoney(String(totalBalance), dominantCurrency)}{" "}
            {dominantCurrency}
          </Stat>
          {data && (
            <>
              <Stat label="Final nominal">
                {formatMoney(data.summary.finalNominal, data.currency)}{" "}
                {data.currency}
              </Stat>
              <Stat label="Final real">
                {formatMoney(data.summary.finalReal, data.currency)}{" "}
                {data.currency}
              </Stat>
              <Stat label="Total return">
                {formatMoney(data.summary.totalReturn, data.currency)}{" "}
                {data.currency}
              </Stat>
            </>
          )}
        </div>
        <div className="mt-4">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : data ? (
            <InvestmentProjectionChart
              data={data.points}
              currency={data.currency}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {loading ? "Calculating projection…" : "No projection yet."}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectionFormDialog({
  open,
  existing,
  accounts,
  onClose,
  onSaved
}: {
  open: boolean;
  existing: ProjectionRow | null;
  accounts: AccountOption[];
  onClose: () => void;
  onSaved: (proj: ProjectionRow) => void;
}) {
  const [form, setForm] = React.useState({
    name: existing?.name ?? "",
    startingCapital: existing?.startingCapital ?? "10000",
    currency: existing?.currency ?? "CHF",
    recurringContribution: existing?.recurringContribution ?? "500",
    contributionFrequency: (existing?.contributionFrequency ?? "monthly") as Frequency,
    expectedAnnualReturn: existing?.expectedAnnualReturn ?? "0.06",
    annualFeeDrag: existing?.annualFeeDrag ?? "0.005",
    inflationRate: existing?.inflationRate ?? "0.02",
    horizonYears: existing?.horizonYears ?? 20,
    accountId: existing?.account?.id ?? ""
  });
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = { ...form, accountId: form.accountId || null };
      const res = await fetch(
        existing
          ? `/api/investment-projections/${existing.id}`
          : "/api/investment-projections",
        {
          method: existing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const saved = await res.json();
      onSaved({
        id: saved.id,
        name: saved.name,
        startingCapital: saved.startingCapital.toString(),
        currency: saved.currency,
        recurringContribution: saved.recurringContribution.toString(),
        contributionFrequency: saved.contributionFrequency,
        expectedAnnualReturn: saved.expectedAnnualReturn.toString(),
        annualFeeDrag: saved.annualFeeDrag.toString(),
        inflationRate: saved.inflationRate.toString(),
        horizonYears: saved.horizonYears,
        account: form.accountId
          ? {
              id: form.accountId,
              name: accounts.find((a) => a.id === form.accountId)?.name ?? ""
            }
          : null
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={existing ? "Edit projection" : "New investment projection"}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Name">
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Starting capital">
            <Input
              type="number"
              step="0.01"
              value={form.startingCapital}
              onChange={(e) =>
                setForm({ ...form, startingCapital: e.target.value })
              }
              required
            />
          </FormField>
          <FormField label="Currency">
            <Input
              value={form.currency}
              maxLength={3}
              onChange={(e) =>
                setForm({ ...form, currency: e.target.value.toUpperCase() })
              }
              required
            />
          </FormField>
          <FormField label="Recurring contribution">
            <Input
              type="number"
              step="0.01"
              value={form.recurringContribution}
              onChange={(e) =>
                setForm({ ...form, recurringContribution: e.target.value })
              }
              required
            />
          </FormField>
          <FormField label="Frequency">
            <Select
              value={form.contributionFrequency}
              onChange={(e) =>
                setForm({
                  ...form,
                  contributionFrequency: e.target.value as Frequency
                })
              }
            >
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </Select>
          </FormField>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <FormField
            label="Annual return"
            hint="e.g. 0.06 for 6%"
          >
            <Input
              type="number"
              step="0.0001"
              value={form.expectedAnnualReturn}
              onChange={(e) =>
                setForm({ ...form, expectedAnnualReturn: e.target.value })
              }
              required
            />
          </FormField>
          <FormField label="Fee drag" hint="e.g. 0.005">
            <Input
              type="number"
              step="0.0001"
              value={form.annualFeeDrag}
              onChange={(e) =>
                setForm({ ...form, annualFeeDrag: e.target.value })
              }
            />
          </FormField>
          <FormField label="Inflation" hint="e.g. 0.02">
            <Input
              type="number"
              step="0.0001"
              value={form.inflationRate}
              onChange={(e) =>
                setForm({ ...form, inflationRate: e.target.value })
              }
            />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Horizon (years)">
            <Input
              type="number"
              min={1}
              max={60}
              value={form.horizonYears}
              onChange={(e) =>
                setForm({ ...form, horizonYears: Number(e.target.value) })
              }
              required
            />
          </FormField>
          <FormField label="Linked account" hint="Optional">
            <Select
              value={form.accountId}
              onChange={(e) => setForm({ ...form, accountId: e.target.value })}
            >
              <option value="">— None —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : existing ? "Save changes" : "Create"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
