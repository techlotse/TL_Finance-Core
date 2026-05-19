"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Building2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { MoneyAmount } from "@/components/money-amount";
import {
  effectiveMonthlyCostCurrency,
  normaliseCurrencyCode
} from "@/lib/account-currency";
import { UpdateBalancesDialog } from "./update-balances-dialog";

type AccountType = "current" | "savings" | "investment" | "credit" | "cash" | "other";

export interface AccountRow {
  id: string;
  name: string;
  institution: string | null;
  accountType: AccountType;
  active: boolean;
  notes: string | null;
  monthlyCost: string | null;
  monthlyCostCurrency: string | null;
  annualInterestRate: string | null;
  expectedAnnualReturn: string | null;
  monthlyManagementCost: string | null;
  minimumMonthlyPayment: string | null;
  currencies: {
    id?: string;
    currency: string;
    openingBalance: string;
    currentBalance: string;
  }[];
}

export function AccountsClient({
  initialAccounts
}: {
  initialAccounts: AccountRow[];
}) {
  const router = useRouter();
  const [accounts, setAccounts] = React.useState<AccountRow[]>(initialAccounts);
  const [editing, setEditing] = React.useState<AccountRow | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [updatingBalances, setUpdatingBalances] = React.useState<AccountRow | null>(null);

  async function handleDelete(id: string) {
    if (!confirm("Deactivate this account?")) return;
    await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    setAccounts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, active: false } : a))
    );
    router.refresh();
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-end">
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> New account
        </Button>
      </div>

      {accounts.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            No bank accounts yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {accounts.map((a) => (
            <Card key={a.id} className={!a.active ? "opacity-60" : ""}>
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div className="flex items-start gap-3">
                  <span className="mt-1 flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Building2 className="h-4 w-4" />
                  </span>
                  <div>
                    <CardTitle>{a.name}</CardTitle>
                    <CardDescription>
                      {a.institution ?? "—"} ·{" "}
                      <span className="capitalize">{a.accountType}</span>
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {!a.active && <Badge variant="outline">Inactive</Badge>}
                  {a.currencies.length > 0 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setUpdatingBalances(a)}
                      aria-label="Record balance snapshot"
                      title="Record balance snapshot"
                    >
                      <RefreshCcw className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditing(a)}
                    aria-label="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(a.id)}
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {a.currencies.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No currency pockets yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {a.currencies.map((c) => (
                      <div
                        key={c.currency}
                        className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2"
                      >
                        <span className="font-medium">{c.currency}</span>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-muted-foreground">
                            opening{" "}
                            <MoneyAmount
                              value={c.openingBalance}
                              currency={c.currency}
                              showCurrency={false}
                            />
                          </span>
                          <MoneyAmount
                            value={c.currentBalance}
                            currency={c.currency}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {(a.monthlyCost || a.annualInterestRate) && (
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    {a.monthlyCost && Number(a.monthlyCost) > 0 && (
                      <span>
                        Monthly fee:{" "}
                        <MoneyAmount
                          value={a.monthlyCost}
                          currency={effectiveMonthlyCostCurrency(a, "CHF")}
                        />
                      </span>
                    )}
                    {a.accountType === "savings" &&
                      a.annualInterestRate &&
                      Number(a.annualInterestRate) > 0 && (
                        <span>
                          Interest:{" "}
                          {(Number(a.annualInterestRate) * 100).toFixed(2)}%
                          /yr
                        </span>
                      )}
                  </div>
                )}
                {a.notes && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {a.notes}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <AccountFormDialog
          open={creating || editing !== null}
          existing={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={(saved) => {
            if (editing) {
              setAccounts((prev) =>
                prev.map((a) => (a.id === saved.id ? saved : a))
              );
            } else {
              setAccounts((prev) => [...prev, saved]);
            }
            router.refresh();
          }}
        />
      )}

      {updatingBalances && (
        <UpdateBalancesDialog
          open={updatingBalances !== null}
          accountId={updatingBalances.id}
          accountName={updatingBalances.name}
          pockets={updatingBalances.currencies.map((c) => ({
            id: c.id,
            currency: c.currency,
            currentBalance: c.currentBalance
          }))}
          onClose={() => setUpdatingBalances(null)}
          onSaved={(updates) => {
            // Optimistic local update so the card reflects the new balance
            // immediately; router.refresh() in the dialog re-fetches anyway.
            setAccounts((prev) =>
              prev.map((a) => {
                if (a.id !== updatingBalances.id) return a;
                return {
                  ...a,
                  currencies: a.currencies.map((c) => {
                    const u = updates.find((x) => x.pocketId === c.id);
                    return u ? { ...c, currentBalance: u.balance } : c;
                  })
                };
              })
            );
          }}
        />
      )}
    </>
  );
}

function AccountFormDialog({
  open,
  existing,
  onClose,
  onSaved
}: {
  open: boolean;
  existing: AccountRow | null;
  onClose: () => void;
  onSaved: (account: AccountRow) => void;
}) {
  const [form, setForm] = React.useState({
    name: existing?.name ?? "",
    institution: existing?.institution ?? "",
    accountType: (existing?.accountType ?? "current") as AccountType,
    notes: existing?.notes ?? "",
    active: existing?.active ?? true,
    monthlyCost: existing?.monthlyCost ?? "",
    monthlyCostCurrency: existing
      ? effectiveMonthlyCostCurrency(existing, "CHF")
      : "CHF",
    annualInterestRate: existing?.annualInterestRate ?? "",
    expectedAnnualReturn: existing?.expectedAnnualReturn ?? "",
    monthlyManagementCost: existing?.monthlyManagementCost ?? "",
    minimumMonthlyPayment: existing?.minimumMonthlyPayment ?? "",
    currencies: existing?.currencies.length
      ? existing.currencies.map((c) => ({
          currency: c.currency,
          openingBalance: c.openingBalance,
          currentBalance: c.currentBalance
        }))
      : [{ currency: "CHF", openingBalance: "0", currentBalance: "0" }]
  });
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function updatePocket(idx: number, patch: Partial<typeof form.currencies[number]>) {
    setForm((prev) =>
      syncCostCurrency({
        ...prev,
        currencies: prev.currencies.map((c, i) =>
          i === idx ? { ...c, ...patch } : c
        )
      })
    );
  }
  function syncCostCurrency(next: typeof form) {
    const codes = next.currencies
      .map((c) => normaliseCurrencyCode(c.currency))
      .filter((code): code is string => Boolean(code));
    const current = normaliseCurrencyCode(next.monthlyCostCurrency);
    if (current && codes.includes(current)) return next;
    return {
      ...next,
      monthlyCostCurrency: codes[0] ?? "CHF"
    };
  }
  function accountCostCurrencyForSubmit() {
    const synced = syncCostCurrency(form);
    return normaliseCurrencyCode(synced.monthlyCostCurrency) ?? "CHF";
  }
  function addPocket() {
    setForm((prev) => ({
      ...prev,
      currencies: [
        ...prev.currencies,
        { currency: "EUR", openingBalance: "0", currentBalance: "0" }
      ]
    }));
  }
  function removePocket(idx: number) {
    setForm((prev) =>
      syncCostCurrency({
        ...prev,
        currencies: prev.currencies.filter((_, i) => i !== idx)
      })
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        institution: form.institution || null,
        accountType: form.accountType,
        notes: form.notes || null,
        active: form.active,
        monthlyCost: form.monthlyCost ? form.monthlyCost : null,
        monthlyCostCurrency: form.monthlyCost
          ? accountCostCurrencyForSubmit()
          : null,
        // Annual interest rate covers two cases: savings (interest earned)
        // and credit (interest charged). Only persist when the account type
        // makes use of it.
        annualInterestRate:
          (form.accountType === "savings" || form.accountType === "credit") &&
          form.annualInterestRate
            ? form.annualInterestRate
            : null,
        expectedAnnualReturn:
          form.accountType === "investment" && form.expectedAnnualReturn
            ? form.expectedAnnualReturn
            : null,
        monthlyManagementCost:
          form.accountType === "investment" && form.monthlyManagementCost
            ? form.monthlyManagementCost
            : null,
        minimumMonthlyPayment:
          form.accountType === "credit" && form.minimumMonthlyPayment
            ? form.minimumMonthlyPayment
            : null,
        currencies: form.currencies.map((c) => ({
          currency: c.currency.toUpperCase(),
          openingBalance: c.openingBalance,
          currentBalance: c.currentBalance
        }))
      };
      const res = await fetch(
        existing ? `/api/accounts/${existing.id}` : "/api/accounts",
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
        institution: saved.institution,
        accountType: saved.accountType,
        active: saved.active,
        notes: saved.notes,
        monthlyCost: saved.monthlyCost?.toString() ?? null,
        monthlyCostCurrency: saved.monthlyCostCurrency ?? null,
        annualInterestRate: saved.annualInterestRate?.toString() ?? null,
        expectedAnnualReturn: saved.expectedAnnualReturn?.toString() ?? null,
        monthlyManagementCost: saved.monthlyManagementCost?.toString() ?? null,
        minimumMonthlyPayment: saved.minimumMonthlyPayment?.toString() ?? null,
        currencies: saved.currencies.map(
          (c: { currency: string; openingBalance: string; currentBalance: string }) => ({
            currency: c.currency,
            openingBalance: c.openingBalance.toString(),
            currentBalance: c.currentBalance.toString()
          })
        )
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
      title={existing ? "Edit account" : "New account"}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Name" className="col-span-2">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </FormField>
          <FormField label="Institution" hint="Optional">
            <Input
              value={form.institution}
              onChange={(e) =>
                setForm({ ...form, institution: e.target.value })
              }
            />
          </FormField>
          <FormField label="Type">
            <Select
              value={form.accountType}
              onChange={(e) =>
                setForm({
                  ...form,
                  accountType: e.target.value as AccountType
                })
              }
            >
              <option value="current">Current</option>
              <option value="savings">Savings</option>
              <option value="investment">Investment</option>
              <option value="credit">Credit</option>
              <option value="cash">Cash</option>
              <option value="other">Other</option>
            </Select>
          </FormField>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <FormField label="Monthly cost" hint="Charged monthly">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.monthlyCost}
              onChange={(e) =>
                setForm({ ...form, monthlyCost: e.target.value })
              }
              placeholder="0.00"
            />
          </FormField>
          <FormField label="Cost currency">
            <Select
              value={form.monthlyCostCurrency}
              onChange={(e) =>
                setForm({ ...form, monthlyCostCurrency: e.target.value })
              }
              disabled={!form.monthlyCost}
            >
              {form.currencies.length === 0 ? (
                <option value="CHF">CHF</option>
              ) : (
                form.currencies.map((c, i) => (
                  <option key={i} value={c.currency}>
                    {c.currency || "—"}
                  </option>
                ))
              )}
            </Select>
          </FormField>
          {form.accountType === "savings" && (
            <FormField label="Annual interest %" hint="e.g. 0.0125 = 1.25%">
              <Input
                type="number"
                step="0.0001"
                min="0"
                value={form.annualInterestRate}
                onChange={(e) =>
                  setForm({ ...form, annualInterestRate: e.target.value })
                }
                placeholder="0.0125"
              />
            </FormField>
          )}
          {form.accountType === "credit" && (
            <FormField label="Annual interest %" hint="APR — e.g. 0.18 = 18%">
              <Input
                type="number"
                step="0.0001"
                min="0"
                value={form.annualInterestRate}
                onChange={(e) =>
                  setForm({ ...form, annualInterestRate: e.target.value })
                }
                placeholder="0.18"
              />
            </FormField>
          )}
        </div>

        {form.accountType === "investment" && (
          <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-muted/30 p-3">
            <FormField
              label="Expected annual return"
              hint="0.06 = 6% / yr"
            >
              <Input
                type="number"
                step="0.0001"
                value={form.expectedAnnualReturn}
                onChange={(e) =>
                  setForm({ ...form, expectedAnnualReturn: e.target.value })
                }
                placeholder="0.06"
              />
            </FormField>
            <FormField
              label="Monthly management cost"
              hint="In account currency"
            >
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.monthlyManagementCost}
                onChange={(e) =>
                  setForm({ ...form, monthlyManagementCost: e.target.value })
                }
                placeholder="0"
              />
            </FormField>
          </div>
        )}

        {form.accountType === "credit" && (
          <FormField
            label="Minimum monthly payment"
            hint="Used by the Debt page to project payoff time"
          >
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.minimumMonthlyPayment}
              onChange={(e) =>
                setForm({ ...form, minimumMonthlyPayment: e.target.value })
              }
              placeholder="0"
            />
          </FormField>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Currency pockets</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addPocket}
            >
              <Plus className="h-3 w-3" /> Add
            </Button>
          </div>
          <div className="space-y-2">
            {form.currencies.map((c, i) => (
              <div
                key={i}
                className="grid grid-cols-[80px_1fr_1fr_auto] items-end gap-2"
              >
                <FormField label="Code">
                  <Input
                    value={c.currency}
                    onChange={(e) =>
                      updatePocket(i, {
                        currency: e.target.value.toUpperCase()
                      })
                    }
                    maxLength={3}
                  />
                </FormField>
                <FormField label="Opening">
                  <Input
                    type="number"
                    step="0.01"
                    value={c.openingBalance}
                    onChange={(e) =>
                      updatePocket(i, { openingBalance: e.target.value })
                    }
                  />
                </FormField>
                <FormField label="Current">
                  <Input
                    type="number"
                    step="0.01"
                    value={c.currentBalance}
                    onChange={(e) =>
                      updatePocket(i, { currentBalance: e.target.value })
                    }
                  />
                </FormField>
                {form.currencies.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removePocket(i)}
                    aria-label="Remove pocket"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        <FormField label="Notes" hint="Optional">
          <Textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </FormField>

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
