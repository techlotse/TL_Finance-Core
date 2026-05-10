"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney, formatPercent } from "@/lib/money";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";

export interface DebtAccountRow {
  id: string;
  name: string;
  institution: string | null;
  active: boolean;
  annualInterestRate: string | null;
  minimumMonthlyPayment: string | null;
  currencies: { currency: string; currentBalance: string }[];
}

interface DebtProjectionResponse {
  accountId: string;
  currency: string;
  balance: string;
  monthlyPayment: string;
  annualInterestRate: string;
  payoffPossible: boolean;
  monthsToPayoff: number | null;
  totalInterestPaid: string;
  totalPaid: string;
  points: {
    month: number;
    balance: string;
    cumulativeInterest: string;
    monthlyInterest: string;
    monthlyPrincipal: string;
  }[];
}

export function DebtClient({
  accounts,
  baseCurrency
}: {
  accounts: DebtAccountRow[];
  baseCurrency: string;
}) {
  if (accounts.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-muted-foreground">
          No credit-type accounts yet. Add one on the Bank Accounts page and
          set its interest rate + minimum payment to see a payoff projection
          here.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {accounts.map((a) => (
        <DebtAccountCard key={a.id} account={a} baseCurrency={baseCurrency} />
      ))}
    </div>
  );
}

function DebtAccountCard({
  account,
  baseCurrency
}: {
  account: DebtAccountRow;
  baseCurrency: string;
}) {
  const [paymentOverride, setPaymentOverride] = React.useState("");
  const [data, setData] = React.useState<DebtProjectionResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const dominantCurrency = account.currencies[0]?.currency ?? baseCurrency;
  const totalBalance = account.currencies.reduce(
    (acc, c) => acc + Math.abs(Number(c.currentBalance)),
    0
  );

  const loadProjection = React.useCallback(
    async (override?: string) => {
      setLoading(true);
      setError(null);
      try {
        const url = new URL(
          `/api/accounts/${account.id}/debt-projection`,
          window.location.origin
        );
        if (override) url.searchParams.set("monthlyPayment", override);
        const res = await fetch(url.toString());
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Failed (${res.status})`);
        }
        setData((await res.json()) as DebtProjectionResponse);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to project");
      } finally {
        setLoading(false);
      }
    },
    [account.id]
  );

  React.useEffect(() => {
    // Auto-load with the configured minimum payment if one exists.
    if (account.annualInterestRate && account.minimumMonthlyPayment) {
      loadProjection();
    }
  }, [
    account.id,
    account.annualInterestRate,
    account.minimumMonthlyPayment,
    loadProjection
  ]);

  const missingConfig =
    !account.annualInterestRate || !account.minimumMonthlyPayment;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>{account.name}</CardTitle>
          <CardDescription>
            {account.institution ?? "—"} · APR{" "}
            {account.annualInterestRate
              ? formatPercent(account.annualInterestRate)
              : "—"}{" "}
            · min payment{" "}
            {account.minimumMonthlyPayment
              ? `${formatMoney(account.minimumMonthlyPayment, dominantCurrency)} ${dominantCurrency}`
              : "—"}
          </CardDescription>
        </div>
        {!account.active && <Badge variant="outline">Inactive</Badge>}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Outstanding">
            {formatMoney(String(totalBalance), dominantCurrency)}{" "}
            {dominantCurrency}
          </Stat>
          {data && (
            <>
              <Stat label="Months to clear">
                {data.payoffPossible
                  ? data.monthsToPayoff
                  : "Never (interest > payment)"}
              </Stat>
              <Stat label="Total interest">
                {formatMoney(data.totalInterestPaid, data.currency)}{" "}
                {data.currency}
              </Stat>
              <Stat label="Total paid">
                {formatMoney(data.totalPaid, data.currency)} {data.currency}
              </Stat>
            </>
          )}
        </div>

        {missingConfig ? (
          <p className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-sm text-muted-foreground">
            Set this account&apos;s annual interest rate and minimum monthly
            payment on the Bank Accounts page to see a payoff projection.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-muted/20 p-3">
              <FormField label="What if I paid each month?" htmlFor={`p-${account.id}`}>
                <Input
                  id={`p-${account.id}`}
                  type="number"
                  step="0.01"
                  min="0"
                  value={paymentOverride}
                  onChange={(e) => setPaymentOverride(e.target.value)}
                  placeholder={
                    account.minimumMonthlyPayment ?? "0"
                  }
                  className="w-40"
                />
              </FormField>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  loadProjection(paymentOverride || undefined)
                }
                disabled={loading}
              >
                {loading ? "Calculating…" : "Recalculate"}
              </Button>
              {paymentOverride && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPaymentOverride("");
                    loadProjection();
                  }}
                >
                  Reset to minimum
                </Button>
              )}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            {data && (
              <DebtPayoffChart
                points={data.points}
                currency={data.currency}
              />
            )}
            {data && !data.payoffPossible && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                With this payment the interest exceeds the payment — the
                balance never reaches zero. Increase the monthly payment.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
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

function DebtPayoffChart({
  points,
  currency
}: {
  points: DebtProjectionResponse["points"];
  currency: string;
}) {
  const rows = points.map((p) => ({
    month: p.month,
    Balance: Number(p.balance),
    "Cumulative interest": Number(p.cumulativeInterest)
  }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickFormatter={(m: number) => (m % 12 === 0 ? `${m / 12}y` : "")}
        />
        <YAxis
          tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
          tickFormatter={(v: number) =>
            new Intl.NumberFormat("de-CH", {
              maximumFractionDigits: 0
            }).format(v) + " " + currency
          }
          width={100}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 8,
            fontSize: 12,
            color: "hsl(var(--card-foreground))"
          }}
          labelStyle={{
            color: "hsl(var(--card-foreground))",
            fontWeight: 500,
            marginBottom: 4
          }}
          itemStyle={{ color: "hsl(var(--card-foreground))" }}
          formatter={(v: number) =>
            new Intl.NumberFormat("de-CH", {
              maximumFractionDigits: 0
            }).format(v) +
            " " +
            currency
          }
          labelFormatter={(m: number) => `Month ${m}`}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="Balance"
          stroke="#ef4444"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="Cumulative interest"
          stroke="#f97316"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
