"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { MoneyAmount } from "@/components/money-amount";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { monthlyMultiplier } from "@/lib/recurrence";

type ItemType = "income" | "expense" | "investment_contribution";
type Recurrence = "once" | "weekly" | "monthly" | "quarterly" | "yearly";

export interface BudgetItemRow {
  id: string;
  name: string;
  itemType: ItemType;
  amount: string;
  currency: string;
  recurrence: Recurrence;
  startDate: string;
  endDate: string | null;
  debitDayOfMonth: number | null;
  expectedAnnualReturn: string | null;
  monthlyManagementCost: string | null;
  active: boolean;
  notes: string | null;
  category: { id: string; name: string; group: { id: string; name: string } };
  account: { id: string; name: string } | null;
  incomeEarner: { id: string; name: string } | null;
}

export interface CategoryGroupOption {
  id: string;
  name: string;
  categories: { id: string; name: string; type: string }[];
}

export interface AccountOption {
  id: string;
  name: string;
  currencies: { currency: string }[];
}

export interface IncomeEarnerOption {
  id: string;
  name: string;
}

export function BudgetClient({
  initialItems,
  groups,
  accounts,
  earners,
  baseCurrency
}: {
  initialItems: BudgetItemRow[];
  groups: CategoryGroupOption[];
  accounts: AccountOption[];
  earners: IncomeEarnerOption[];
  baseCurrency: string;
}) {
  const router = useRouter();
  const [items, setItems] = React.useState<BudgetItemRow[]>(initialItems);

  const [filters, setFilters] = React.useState({
    type: "",
    accountId: "",
    earnerId: "",
    showInactive: false
  });

  const [editing, setEditing] = React.useState<BudgetItemRow | null>(null);
  const [creating, setCreating] = React.useState(false);

  const filtered = items.filter((i) => {
    if (!filters.showInactive && !i.active) return false;
    if (filters.type && i.itemType !== filters.type) return false;
    if (filters.accountId && i.account?.id !== filters.accountId) return false;
    if (filters.earnerId && i.incomeEarner?.id !== filters.earnerId) return false;
    return true;
  });

  // Group by category group for visual hierarchy.
  const grouped = new Map<string, BudgetItemRow[]>();
  for (const item of filtered) {
    const key = item.category.group.name;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  }

  async function handleDelete(id: string) {
    if (!confirm("Deactivate this budget item?")) return;
    await fetch(`/api/budget-items/${id}`, { method: "DELETE" });
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, active: false } : it))
    );
    router.refresh();
  }

  async function handleToggleActive(item: BudgetItemRow) {
    const next = !item.active;
    await fetch(`/api/budget-items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: next })
    });
    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, active: next } : it))
    );
    router.refresh();
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="grow">
          <div className="flex flex-wrap gap-2">
            <Select
              value={filters.type}
              onChange={(e) =>
                setFilters((f) => ({ ...f, type: e.target.value }))
              }
              className="w-44"
              aria-label="Filter by type"
            >
              <option value="">All types</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
              <option value="investment_contribution">Investment</option>
            </Select>
            <Select
              value={filters.accountId}
              onChange={(e) =>
                setFilters((f) => ({ ...f, accountId: e.target.value }))
              }
              className="w-44"
              aria-label="Filter by account"
            >
              <option value="">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            <Select
              value={filters.earnerId}
              onChange={(e) =>
                setFilters((f) => ({ ...f, earnerId: e.target.value }))
              }
              className="w-44"
              aria-label="Filter by earner"
            >
              <option value="">All earners</option>
              {earners.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
            <label className="ml-auto inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Switch
                checked={filters.showInactive}
                onCheckedChange={(v) =>
                  setFilters((f) => ({ ...f, showInactive: v }))
                }
              />
              Show inactive
            </label>
          </div>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> New budget item
        </Button>
      </div>

      {grouped.size === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            No budget items match your filters.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([groupName, rows]) => {
            // Subtotals per currency, computed from active rows only — an
            // inactive item shouldn't bend the visible total. Using a Map keeps
            // the original currency order so CHF stays first when most items
            // are CHF, etc.
            const subtotals = new Map<string, { gross: number; monthly: number }>();
            for (const it of rows) {
              if (!it.active) continue;
              const cur = it.currency;
              const monthly =
                Number(it.amount) *
                Number(monthlyMultiplier(it.recurrence as Recurrence));
              // Income contributes positively, expense / investment_contribution
              // both flow out — we present them as positive values though so the
              // subtotal reads "total spend in this group" intuitively.
              const prev = subtotals.get(cur) ?? { gross: 0, monthly: 0 };
              prev.gross += Number(it.amount);
              prev.monthly += monthly;
              subtotals.set(cur, prev);
            }

            return (
              <Card key={groupName}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                    {groupName}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Name</TH>
                        <TH>Category</TH>
                        <TH>Type</TH>
                        <TH className="text-right">Amount</TH>
                        <TH className="text-right">Monthly</TH>
                        <TH>Account</TH>
                        <TH>Earner</TH>
                        <TH>Recurrence</TH>
                        <TH></TH>
                      </TR>
                    </THead>
                    <TBody>
                      {rows.map((it) => {
                        const monthly = Number(it.amount) *
                          Number(monthlyMultiplier(it.recurrence as Recurrence));
                        return (
                          <TR
                            key={it.id}
                            className={!it.active ? "opacity-50" : ""}
                          >
                            <TD className="font-medium">{it.name}</TD>
                            <TD className="text-muted-foreground">
                              {it.category.name}
                            </TD>
                            <TD>{itemTypeBadge(it.itemType)}</TD>
                            <TD className="text-right">
                              <MoneyAmount
                                value={it.amount}
                                currency={it.currency}
                              />
                            </TD>
                            <TD className="text-right text-muted-foreground tabular">
                              {formatMoney(monthly, it.currency)} {it.currency}
                            </TD>
                            <TD>{it.account?.name ?? "—"}</TD>
                            <TD>{it.incomeEarner?.name ?? "—"}</TD>
                            <TD className="capitalize">{it.recurrence}</TD>
                            <TD className="text-right whitespace-nowrap">
                              <Switch
                                checked={it.active}
                                onCheckedChange={() => handleToggleActive(it)}
                                ariaLabel={`Toggle ${it.name}`}
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="ml-1"
                                onClick={() => setEditing(it)}
                                aria-label="Edit"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(it.id)}
                                aria-label="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TD>
                          </TR>
                        );
                      })}
                      {subtotals.size > 0 && (
                        <TR className="bg-muted/30 font-medium">
                          <TD colSpan={3} className="text-right text-muted-foreground">
                            Subtotal ({rows.filter((r) => r.active).length}{" "}
                            active)
                          </TD>
                          <TD className="text-right tabular">
                            {Array.from(subtotals.entries()).map(
                              ([cur, t], i) => (
                                <div key={cur} className={i > 0 ? "mt-0.5" : ""}>
                                  {formatMoney(t.gross, cur)}{" "}
                                  <span className="text-xs text-muted-foreground">
                                    {cur}
                                  </span>
                                </div>
                              )
                            )}
                          </TD>
                          <TD className="text-right tabular">
                            {Array.from(subtotals.entries()).map(
                              ([cur, t], i) => (
                                <div key={cur} className={i > 0 ? "mt-0.5" : ""}>
                                  {formatMoney(t.monthly, cur)}{" "}
                                  <span className="text-xs text-muted-foreground">
                                    {cur}
                                  </span>
                                </div>
                              )
                            )}
                          </TD>
                          <TD colSpan={4}></TD>
                        </TR>
                      )}
                    </TBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {(creating || editing) && (
        <BudgetItemFormDialog
          open={creating || editing !== null}
          existing={editing}
          groups={groups}
          accounts={accounts}
          earners={earners}
          baseCurrency={baseCurrency}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={(saved) => {
            if (editing) {
              setItems((prev) =>
                prev.map((it) => (it.id === saved.id ? saved : it))
              );
            } else {
              setItems((prev) => [saved, ...prev]);
            }
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function itemTypeBadge(type: ItemType) {
  if (type === "income") return <Badge variant="success">Income</Badge>;
  if (type === "expense") return <Badge variant="destructive">Expense</Badge>;
  return <Badge>Investment</Badge>;
}

function BudgetItemFormDialog({
  open,
  existing,
  groups,
  accounts,
  earners,
  baseCurrency,
  onClose,
  onSaved
}: {
  open: boolean;
  existing: BudgetItemRow | null;
  groups: CategoryGroupOption[];
  accounts: AccountOption[];
  earners: IncomeEarnerOption[];
  baseCurrency: string;
  onClose: () => void;
  onSaved: (item: BudgetItemRow) => void;
}) {
  const [form, setForm] = React.useState({
    name: existing?.name ?? "",
    itemType: (existing?.itemType ?? "expense") as ItemType,
    amount: existing?.amount ?? "",
    currency: existing?.currency ?? baseCurrency,
    recurrence: (existing?.recurrence ?? "monthly") as Recurrence,
    startDate: (existing?.startDate ?? new Date().toISOString()).slice(0, 10),
    endDate: existing?.endDate ? existing.endDate.slice(0, 10) : "",
    debitDayOfMonth: existing?.debitDayOfMonth?.toString() ?? "",
    categoryId: existing?.category.id ?? "",
    accountId: existing?.account?.id ?? "",
    incomeEarnerId: existing?.incomeEarner?.id ?? "",
    expectedAnnualReturn: existing?.expectedAnnualReturn ?? "",
    monthlyManagementCost: existing?.monthlyManagementCost ?? "",
    notes: existing?.notes ?? "",
    active: existing?.active ?? true
  });
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Categories filtered by item type when sensible.
  const categories = React.useMemo(() => {
    return groups.flatMap((g) =>
      g.categories.map((c) => ({
        ...c,
        groupName: g.name
      }))
    );
  }, [groups]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const debitDay = form.debitDayOfMonth
        ? Math.max(1, Math.min(31, Number(form.debitDayOfMonth)))
        : null;
      const payload = {
        name: form.name,
        itemType: form.itemType,
        amount: form.amount,
        currency: form.currency,
        recurrence: form.recurrence,
        startDate: new Date(form.startDate).toISOString(),
        endDate: form.endDate
          ? new Date(form.endDate).toISOString()
          : null,
        debitDayOfMonth: debitDay,
        categoryId: form.categoryId,
        accountId: form.accountId || null,
        incomeEarnerId: form.incomeEarnerId || null,
        expectedAnnualReturn:
          form.itemType === "investment_contribution" && form.expectedAnnualReturn
            ? form.expectedAnnualReturn
            : null,
        monthlyManagementCost:
          form.itemType === "investment_contribution" && form.monthlyManagementCost
            ? form.monthlyManagementCost
            : null,
        notes: form.notes || null,
        active: form.active
      };
      const res = await fetch(
        existing ? `/api/budget-items/${existing.id}` : "/api/budget-items",
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
      // Decorate with relations the API returned without nested includes.
      const decorated: BudgetItemRow = {
        ...saved,
        category:
          existing?.category ??
          (() => {
            const cat = categories.find((c) => c.id === form.categoryId);
            const grp = groups.find((g) =>
              g.categories.some((c) => c.id === form.categoryId)
            );
            return {
              id: form.categoryId,
              name: cat?.name ?? "",
              group: { id: grp?.id ?? "", name: grp?.name ?? "" }
            };
          })(),
        account: form.accountId
          ? {
              id: form.accountId,
              name:
                accounts.find((a) => a.id === form.accountId)?.name ?? ""
            }
          : null,
        incomeEarner: form.incomeEarnerId
          ? {
              id: form.incomeEarnerId,
              name:
                earners.find((e) => e.id === form.incomeEarnerId)?.name ?? ""
            }
          : null
      };
      onSaved(decorated);
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
      title={existing ? "Edit budget item" : "New budget item"}
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
          <FormField label="Type">
            <Select
              value={form.itemType}
              onChange={(e) =>
                setForm({ ...form, itemType: e.target.value as ItemType })
              }
            >
              <option value="income">Income</option>
              <option value="expense">Expense</option>
              <option value="investment_contribution">Investment</option>
            </Select>
          </FormField>
          <FormField label="Recurrence">
            <Select
              value={form.recurrence}
              onChange={(e) =>
                setForm({ ...form, recurrence: e.target.value as Recurrence })
              }
            >
              <option value="once">Once</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </Select>
          </FormField>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Amount" className="col-span-2">
            <Input
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
            />
          </FormField>
          <FormField label="Currency">
            <Input
              value={form.currency}
              onChange={(e) =>
                setForm({ ...form, currency: e.target.value.toUpperCase() })
              }
              maxLength={3}
              required
            />
          </FormField>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Start date">
            <Input
              type="date"
              value={form.startDate}
              onChange={(e) =>
                setForm({ ...form, startDate: e.target.value })
              }
              required
            />
          </FormField>
          <FormField label="End date" hint="Optional">
            <Input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            />
          </FormField>
          <FormField
            label="Debit day"
            hint={
              form.recurrence === "weekly" || form.recurrence === "once"
                ? "n/a"
                : "1–31"
            }
          >
            <Input
              type="number"
              min={1}
              max={31}
              value={form.debitDayOfMonth}
              onChange={(e) =>
                setForm({ ...form, debitDayOfMonth: e.target.value })
              }
              disabled={
                form.recurrence === "weekly" || form.recurrence === "once"
              }
              placeholder={
                form.recurrence === "weekly" || form.recurrence === "once"
                  ? ""
                  : new Date(form.startDate).getDate().toString()
              }
            />
          </FormField>
        </div>

        {form.itemType === "investment_contribution" && (
          <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-muted/30 p-3">
            <FormField
              label="Expected annual return"
              hint="0.05 = 5%"
            >
              <Input
                type="number"
                step="0.001"
                value={form.expectedAnnualReturn}
                onChange={(e) =>
                  setForm({ ...form, expectedAnnualReturn: e.target.value })
                }
                placeholder="0.05"
              />
            </FormField>
            <FormField
              label="Monthly management cost"
              hint={`In ${form.currency}`}
            >
              <Input
                type="number"
                step="0.01"
                value={form.monthlyManagementCost}
                onChange={(e) =>
                  setForm({
                    ...form,
                    monthlyManagementCost: e.target.value
                  })
                }
                placeholder="0"
              />
            </FormField>
          </div>
        )}
        <FormField label="Category">
          <Select
            value={form.categoryId}
            onChange={(e) =>
              setForm({ ...form, categoryId: e.target.value })
            }
            required
          >
            <option value="">Select a category…</option>
            {groups.map((g) => (
              <optgroup key={g.id} label={g.name}>
                {g.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Bank account" hint="Optional">
            <Select
              value={form.accountId}
              onChange={(e) =>
                setForm({ ...form, accountId: e.target.value })
              }
            >
              <option value="">— None —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Income earner" hint="Optional">
            <Select
              value={form.incomeEarnerId}
              onChange={(e) =>
                setForm({ ...form, incomeEarnerId: e.target.value })
              }
            >
              <option value="">— None —</option>
              {earners.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </FormField>
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
