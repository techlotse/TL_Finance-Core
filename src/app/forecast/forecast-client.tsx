"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, TrendingUp, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  BalanceForecastChart,
  DailyAccountChart,
  NetWorthForecastChart
} from "@/components/charts/dashboard-charts";
import { formatMoney } from "@/lib/money";

const HORIZONS = [1, 3, 5, 10, 15, 20, 25] as const;

export interface ForecastPayload {
  horizonYears: number;
  baseCurrency: string;
  accounts: { id: string; name: string; accountType: string }[];
  investmentItems: { id: string; name: string; currency: string }[];
  points: {
    month: string;
    totalBaseCurrency: string;
    netWorthBaseCurrency: string;
    monthlyIncome: string;
    monthlyExpenses: string;
    netCashflow: string;
    accountBalances: Record<string, string>;
    investmentBalances: Record<string, string>;
  }[];
  yearly: {
    month: string;
    totalBaseCurrency: string;
    netWorthBaseCurrency: string;
    accountBalances: Record<string, string>;
    investmentBalances: Record<string, string>;
  }[];
}

type Tab = "networth" | "accounts";

export function ForecastClient({
  horizon,
  initial
}: {
  horizon: number;
  initial: ForecastPayload;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = React.useState<Tab>("networth");

  function changeHorizon(next: number) {
    const params = new URLSearchParams(searchParams);
    params.set("horizonYears", String(next));
    router.push(`/forecast?${params.toString()}`);
  }

  const finalPoint = initial.points[initial.points.length - 1];

  return (
    <>
      {tab === "networth" && (
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Horizon
            </label>
            <Select
              value={String(horizon)}
              onChange={(e) => changeHorizon(Number(e.target.value))}
              className="w-32"
            >
              {HORIZONS.map((h) => (
                <option key={h} value={h}>
                  {h} years
                </option>
              ))}
            </Select>
          </div>
          <div className="ml-auto rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Final net worth · </span>
            <span className="font-semibold tabular">
              {finalPoint
                ? `${formatMoney(finalPoint.netWorthBaseCurrency, initial.baseCurrency)} ${initial.baseCurrency}`
                : "—"}
            </span>
          </div>
        </div>
      )}

      <div className="mb-4 inline-flex rounded-md border border-border bg-muted/30 p-1">
        <button
          type="button"
          onClick={() => setTab("networth")}
          className={`inline-flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition ${
            tab === "networth"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <TrendingUp className="h-4 w-4" /> Net worth
        </button>
        <button
          type="button"
          onClick={() => setTab("accounts")}
          className={`inline-flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition ${
            tab === "accounts"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Wallet className="h-4 w-4" /> By account
        </button>
      </div>

      {tab === "networth" ? (
        <NetWorthTab initial={initial} />
      ) : (
        <AccountsTab initial={initial} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Net worth tab
// ---------------------------------------------------------------------------

function NetWorthTab({ initial }: { initial: ForecastPayload }) {
  return (
    <>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Total family net worth</CardTitle>
          <CardDescription>
            Liquid accounts plus accumulated investment buckets, in{" "}
            {initial.baseCurrency} at today&apos;s rates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NetWorthForecastChart
            data={initial.points.map((p) => ({
              month: p.month,
              liquidBaseCurrency: p.totalBaseCurrency,
              netWorthBaseCurrency: p.netWorthBaseCurrency
            }))}
            currency={initial.baseCurrency}
          />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Liquid balance</CardTitle>
          <CardDescription>
            Sum of all bank-account balances each month.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BalanceForecastChart
            data={initial.points.map((p) => ({
              month: p.month,
              totalBaseCurrency: p.totalBaseCurrency
            }))}
            currency={initial.baseCurrency}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Yearly endings</CardTitle>
          <CardDescription>
            Snapshot at the end of each calendar year of the horizon.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {initial.yearly.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Pick a horizon of at least 1 year to see annual snapshots.
            </p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Month</TH>
                  <TH className="text-right">
                    Liquid ({initial.baseCurrency})
                  </TH>
                  <TH className="text-right">
                    Net worth ({initial.baseCurrency})
                  </TH>
                  {initial.accounts.map((a) => (
                    <TH key={a.id} className="text-right">
                      {a.name}
                    </TH>
                  ))}
                </TR>
              </THead>
              <TBody>
                {initial.yearly.map((y) => (
                  <TR key={y.month}>
                    <TD className="font-medium">{y.month}</TD>
                    <TD className="text-right tabular">
                      {formatMoney(y.totalBaseCurrency, initial.baseCurrency)}
                    </TD>
                    <TD className="text-right tabular font-semibold">
                      {formatMoney(
                        y.netWorthBaseCurrency,
                        initial.baseCurrency
                      )}
                    </TD>
                    {initial.accounts.map((a) => (
                      <TD
                        key={a.id}
                        className="text-right tabular text-muted-foreground"
                      >
                        {formatMoney(
                          y.accountBalances[a.id] ?? "0",
                          initial.baseCurrency
                        )}
                      </TD>
                    ))}
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Accounts tab
// ---------------------------------------------------------------------------

interface DailyForecastResponse {
  account: { id: string; name: string };
  baseCurrency: string;
  pastDays: number;
  futureDays: number;
  todayIndex: number;
  goesNegative: boolean;
  low: { date: string; totalBaseCurrency: string };
  points: {
    date: string;
    totalBaseCurrency: string;
    perCurrency: Record<string, string>;
    events: {
      kind: string;
      name: string;
      amount: string;
      currency: string;
    }[];
  }[];
}

// Max slots a user can compare side-by-side. Higher than 6 stops being
// readable on a typical screen even at xl width; bump if you ever want more.
const MAX_FORECAST_SLOTS = 8;

function AccountsTab({ initial }: { initial: ForecastPayload }) {
  const accs = initial.accounts;
  // Default: pre-fill up to 3 slots so the UX matches the previous version.
  const [slots, setSlots] = React.useState<string[]>(() => {
    const initialCount = Math.min(3, accs.length);
    return Array.from(
      { length: Math.max(1, initialCount) },
      (_, i) => accs[i]?.id ?? ""
    );
  });

  if (accs.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-muted-foreground">
          No active accounts to forecast.
        </CardContent>
      </Card>
    );
  }

  function setSlot(i: number, id: string) {
    setSlots((prev) => {
      const next = [...prev];
      next[i] = id;
      return next;
    });
  }

  function addSlot() {
    if (slots.length >= MAX_FORECAST_SLOTS) return;
    // Pre-select an account that isn't already chosen, falling back to the
    // first one if everything is in use.
    const used = new Set(slots);
    const next = accs.find((a) => !used.has(a.id))?.id ?? accs[0]?.id ?? "";
    setSlots((prev) => [...prev, next]);
  }

  function removeSlot(i: number) {
    setSlots((prev) =>
      prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)
    );
  }

  // Pick the densest grid that still gives each card breathing room.
  // 1 → full width · 2 → 2-up · 3 → 3-up · 4+ → 3 wide on xl, 2 wide on lg.
  const slotCount = slots.length;
  const gridClass =
    slotCount === 1
      ? ""
      : slotCount === 2
        ? "lg:grid-cols-2"
        : slotCount === 3
          ? "lg:grid-cols-2 xl:grid-cols-3"
          : "lg:grid-cols-2 xl:grid-cols-3";

  const stacked = slotCount > 1;

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          Comparing {slotCount} account{slotCount === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          onClick={addSlot}
          disabled={slotCount >= MAX_FORECAST_SLOTS}
          className="ml-auto inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          + Add account
        </button>
      </div>

      <div className={`grid grid-cols-1 gap-6 ${gridClass}`}>
        {slots.map((accountId, i) => (
          <div key={i} className="min-w-0">
            <div className="mb-3 flex items-end gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Account {i + 1}
                </label>
                <Select
                  value={accountId}
                  onChange={(e) => setSlot(i, e.target.value)}
                  className="w-full"
                >
                  {accs.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </div>
              {slotCount > 1 && (
                <button
                  type="button"
                  onClick={() => removeSlot(i)}
                  aria-label={`Remove account slot ${i + 1}`}
                  className="h-9 rounded-md border border-border bg-background px-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                  title="Remove this slot"
                >
                  ×
                </button>
              )}
            </div>
            {accountId && (
              <AccountDailyView
                key={`${i}-${accountId}`}
                accountId={accountId}
                baseCurrency={initial.baseCurrency}
                stacked={stacked}
              />
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function AccountDailyView({
  accountId,
  baseCurrency,
  stacked = false
}: {
  accountId: string;
  baseCurrency: string;
  stacked?: boolean;
}) {
  const [data, setData] = React.useState<DailyForecastResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(
      `/api/forecast/account/${accountId}?pastDays=30&futureDays=60`
    )
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Failed (${res.status})`);
        }
        return res.json() as Promise<DailyForecastResponse>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-muted-foreground">
          Loading…
        </CardContent>
      </Card>
    );
  }
  if (error) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-destructive">
          {error}
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;

  const today = data.points[data.todayIndex];
  const upcoming = data.points
    .slice(data.todayIndex + 1)
    .flatMap((p) =>
      p.events.map((e) => ({ date: p.date, ...e }))
    )
    .slice(0, 12);

  return (
    <>
      {data.goesNegative && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
            <div className="text-sm">
              <p className="font-medium text-destructive">
                Projected balance dips below zero
              </p>
              <p className="text-muted-foreground">
                Lowest point:{" "}
                <span className="font-semibold">
                  {formatMoney(data.low.totalBaseCurrency, baseCurrency)}{" "}
                  {baseCurrency}
                </span>{" "}
                on{" "}
                {new Date(data.low.date).toLocaleDateString("de-CH")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>{data.account.name}</CardTitle>
          <CardDescription>
            Past {data.pastDays} days and next {data.futureDays} days · today
            highlighted in green.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DailyAccountChart
            data={data.points.map((p) => ({
              date: p.date,
              totalBaseCurrency: p.totalBaseCurrency
            }))}
            currency={baseCurrency}
            todayIndex={data.todayIndex}
          />
        </CardContent>
      </Card>

      <div className={`grid grid-cols-1 gap-4 ${stacked ? "" : "lg:grid-cols-2"}`}>
        <Card>
          <CardHeader>
            <CardTitle>Today&apos;s pockets</CardTitle>
            <CardDescription>
              Per-currency balances anchoring the projection.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {today ? (
              <Table>
                <THead>
                  <TR>
                    <TH>Currency</TH>
                    <TH className="text-right">Balance</TH>
                  </TR>
                </THead>
                <TBody>
                  {Object.entries(today.perCurrency).map(([c, v]) => (
                    <TR key={c}>
                      <TD className="font-medium">{c}</TD>
                      <TD className="text-right tabular">
                        {formatMoney(v, c)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No data.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming events</CardTitle>
            <CardDescription>
              Next {upcoming.length} scheduled debits, credits and transfers.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing scheduled in the visible window.
              </p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {upcoming.map((e, i) => {
                  const amt = Number(e.amount);
                  const isOut = amt < 0;
                  return (
                    <li
                      key={i}
                      className="flex items-center justify-between py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {new Date(e.date).toLocaleDateString("de-CH", {
                            month: "short",
                            day: "numeric"
                          })}
                        </span>
                        <span>{e.name}</span>
                        <EventBadge kind={e.kind} />
                      </div>
                      <span
                        className={`tabular ${
                          isOut ? "text-destructive" : "text-emerald-500"
                        }`}
                      >
                        {isOut ? "" : "+"}
                        {formatMoney(e.amount, e.currency)} {e.currency}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function EventBadge({ kind }: { kind: string }) {
  switch (kind) {
    case "transfer-in":
    case "transfer-out":
      return (
        <Badge variant="outline" className="text-xs">
          transfer
        </Badge>
      );
    case "fee":
      return (
        <Badge variant="outline" className="text-xs">
          fee
        </Badge>
      );
    case "interest":
      return (
        <Badge variant="outline" className="text-xs">
          interest
        </Badge>
      );
    default:
      return null;
  }
}
