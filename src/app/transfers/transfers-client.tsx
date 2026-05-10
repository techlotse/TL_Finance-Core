"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { MoneyAmount } from "@/components/money-amount";

type Recurrence = "once" | "weekly" | "monthly" | "quarterly" | "yearly";

export interface TransferRow {
  id: string;
  name: string;
  amount: string;
  sourceCurrency: string;
  targetCurrency: string;
  recurrence: Recurrence;
  startDate: string;
  endDate: string | null;
  active: boolean;
  notes: string | null;
  sourceAccount: { id: string; name: string };
  targetAccount: { id: string; name: string };
}

export interface AccountOption {
  id: string;
  name: string;
  currencies: { currency: string }[];
}

export function TransfersClient({
  initialTransfers,
  accounts
}: {
  initialTransfers: TransferRow[];
  accounts: AccountOption[];
}) {
  const router = useRouter();
  const [transfers, setTransfers] =
    React.useState<TransferRow[]>(initialTransfers);
  const [editing, setEditing] = React.useState<TransferRow | null>(null);
  const [creating, setCreating] = React.useState(false);

  async function handleDelete(id: string) {
    if (!confirm("Deactivate this scheduled transfer?")) return;
    await fetch(`/api/transfers/${id}`, { method: "DELETE" });
    setTransfers((prev) =>
      prev.map((t) => (t.id === id ? { ...t, active: false } : t))
    );
    router.refresh();
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-end">
        <Button
          onClick={() => setCreating(true)}
          disabled={accounts.length < 1}
          title={
            accounts.length < 1 ? "Create at least one bank account first" : ""
          }
        >
          <Plus className="h-4 w-4" /> New transfer
        </Button>
      </div>

      {transfers.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            No scheduled transfers yet.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>From</TH>
                  <TH></TH>
                  <TH>To</TH>
                  <TH className="text-right">Amount</TH>
                  <TH>Recurrence</TH>
                  <TH>Next from</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {transfers.map((t) => (
                  <TR key={t.id} className={!t.active ? "opacity-60" : ""}>
                    <TD className="font-medium">
                      {t.name}
                      {!t.active && (
                        <Badge variant="outline" className="ml-2">
                          Inactive
                        </Badge>
                      )}
                    </TD>
                    <TD>
                      <div className="font-medium">{t.sourceAccount.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {t.sourceCurrency}
                      </div>
                    </TD>
                    <TD className="text-muted-foreground">
                      <ArrowRight className="h-4 w-4" />
                    </TD>
                    <TD>
                      <div className="font-medium">{t.targetAccount.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {t.targetCurrency}
                      </div>
                    </TD>
                    <TD className="text-right">
                      <MoneyAmount
                        value={t.amount}
                        currency={t.sourceCurrency}
                      />
                    </TD>
                    <TD className="capitalize">{t.recurrence}</TD>
                    <TD className="text-muted-foreground">
                      {new Date(t.startDate).toLocaleDateString("de-CH")}
                    </TD>
                    <TD className="text-right whitespace-nowrap">
                      <Switch
                        checked={t.active}
                        onCheckedChange={async (next) => {
                          await fetch(`/api/transfers/${t.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ active: next })
                          });
                          setTransfers((prev) =>
                            prev.map((x) =>
                              x.id === t.id ? { ...x, active: next } : x
                            )
                          );
                          router.refresh();
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="ml-1"
                        onClick={() => setEditing(t)}
                        aria-label="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(t.id)}
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {(creating || editing) && (
        <TransferFormDialog
          open={creating || editing !== null}
          existing={editing}
          accounts={accounts}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={(saved) => {
            if (editing) {
              setTransfers((prev) =>
                prev.map((t) => (t.id === saved.id ? saved : t))
              );
            } else {
              setTransfers((prev) => [...prev, saved]);
            }
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function TransferFormDialog({
  open,
  existing,
  accounts,
  onClose,
  onSaved
}: {
  open: boolean;
  existing: TransferRow | null;
  accounts: AccountOption[];
  onClose: () => void;
  onSaved: (transfer: TransferRow) => void;
}) {
  const [form, setForm] = React.useState({
    name: existing?.name ?? "",
    amount: existing?.amount ?? "",
    sourceAccountId: existing?.sourceAccount.id ?? accounts[0]?.id ?? "",
    sourceCurrency:
      existing?.sourceCurrency ??
      accounts[0]?.currencies[0]?.currency ??
      "CHF",
    targetAccountId: existing?.targetAccount.id ?? accounts[0]?.id ?? "",
    targetCurrency:
      existing?.targetCurrency ??
      accounts[0]?.currencies[0]?.currency ??
      "CHF",
    recurrence: (existing?.recurrence ?? "monthly") as Recurrence,
    startDate: (existing?.startDate ?? new Date().toISOString()).slice(0, 10),
    endDate: existing?.endDate ? existing.endDate.slice(0, 10) : "",
    notes: existing?.notes ?? "",
    active: existing?.active ?? true
  });
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const sourceCurrencies = accounts.find((a) => a.id === form.sourceAccountId)
    ?.currencies ?? [];
  const targetCurrencies = accounts.find((a) => a.id === form.targetAccountId)
    ?.currencies ?? [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        amount: form.amount,
        sourceAccountId: form.sourceAccountId,
        sourceCurrency: form.sourceCurrency,
        targetAccountId: form.targetAccountId,
        targetCurrency: form.targetCurrency,
        recurrence: form.recurrence,
        startDate: new Date(form.startDate).toISOString(),
        endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
        notes: form.notes || null,
        active: form.active
      };
      const res = await fetch(
        existing ? `/api/transfers/${existing.id}` : "/api/transfers",
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
      const sourceAccount = accounts.find(
        (a) => a.id === form.sourceAccountId
      );
      const targetAccount = accounts.find(
        (a) => a.id === form.targetAccountId
      );
      onSaved({
        id: saved.id,
        name: saved.name,
        amount: saved.amount.toString(),
        sourceCurrency: saved.sourceCurrency,
        targetCurrency: saved.targetCurrency,
        recurrence: saved.recurrence,
        startDate: saved.startDate,
        endDate: saved.endDate,
        active: saved.active,
        notes: saved.notes,
        sourceAccount: sourceAccount
          ? { id: sourceAccount.id, name: sourceAccount.name }
          : { id: form.sourceAccountId, name: "" },
        targetAccount: targetAccount
          ? { id: targetAccount.id, name: targetAccount.name }
          : { id: form.targetAccountId, name: "" }
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
      title={existing ? "Edit transfer" : "New scheduled transfer"}
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
          <FormField label="Source account">
            <Select
              value={form.sourceAccountId}
              onChange={(e) =>
                setForm({ ...form, sourceAccountId: e.target.value })
              }
              required
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Source currency">
            <Select
              value={form.sourceCurrency}
              onChange={(e) =>
                setForm({ ...form, sourceCurrency: e.target.value })
              }
              required
            >
              {sourceCurrencies.length === 0 ? (
                <option value={form.sourceCurrency}>
                  {form.sourceCurrency}
                </option>
              ) : (
                sourceCurrencies.map((c) => (
                  <option key={c.currency} value={c.currency}>
                    {c.currency}
                  </option>
                ))
              )}
            </Select>
          </FormField>
          <FormField label="Target account">
            <Select
              value={form.targetAccountId}
              onChange={(e) =>
                setForm({ ...form, targetAccountId: e.target.value })
              }
              required
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Target currency">
            <Select
              value={form.targetCurrency}
              onChange={(e) =>
                setForm({ ...form, targetCurrency: e.target.value })
              }
              required
            >
              {targetCurrencies.length === 0 ? (
                <option value={form.targetCurrency}>
                  {form.targetCurrency}
                </option>
              ) : (
                targetCurrencies.map((c) => (
                  <option key={c.currency} value={c.currency}>
                    {c.currency}
                  </option>
                ))
              )}
            </Select>
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Amount">
            <Input
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
            />
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
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Start date">
            <Input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
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
