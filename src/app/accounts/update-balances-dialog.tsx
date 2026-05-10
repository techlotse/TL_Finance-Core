"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { FormField } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { formatMoney } from "@/lib/money";

interface PocketLine {
  id?: string;
  currency: string;
  currentBalance: string;
  /** New value the user types in. Empty = "leave alone". */
  newBalance: string;
}

interface RecentSnapshot {
  id: string;
  currency: string;
  balance: string;
  asOf: string;
  note: string | null;
}

/**
 * Dialog used to record an actual-balance reading for one or more currency
 * pockets of an account. Each pocket is its own row; leaving the "new
 * balance" empty skips that pocket. Submission posts one snapshot per pocket
 * touched and the server atomically mirrors the value onto the pocket's
 * `currentBalance`.
 */
export function UpdateBalancesDialog({
  open,
  accountId,
  accountName,
  pockets,
  onClose,
  onSaved
}: {
  open: boolean;
  accountId: string;
  accountName: string;
  pockets: { id?: string; currency: string; currentBalance: string }[];
  onClose: () => void;
  onSaved: (
    updates: { pocketId: string; currency: string; balance: string }[]
  ) => void;
}) {
  const router = useRouter();
  const [lines, setLines] = React.useState<PocketLine[]>([]);
  const [asOf, setAsOf] = React.useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [note, setNote] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [history, setHistory] = React.useState<RecentSnapshot[]>([]);
  const [loadingHistory, setLoadingHistory] = React.useState(false);

  // Initialise / reset whenever the dialog is reopened against a new account.
  React.useEffect(() => {
    if (!open) return;
    setLines(
      pockets.map((p) => ({
        id: p.id,
        currency: p.currency,
        currentBalance: p.currentBalance,
        newBalance: ""
      }))
    );
    setAsOf(new Date().toISOString().slice(0, 10));
    setNote("");
    setError(null);

    // Load recent snapshots in the background so the user has a sense of
    // what's been recorded before. Failure is silent — the dialog still works.
    setLoadingHistory(true);
    fetch(`/api/accounts/${accountId}/snapshots`)
      .then(async (res) => {
        if (!res.ok) throw new Error();
        return (await res.json()) as RecentSnapshot[];
      })
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setLoadingHistory(false));
  }, [open, accountId, pockets]);

  function setLine(idx: number, value: string) {
    setLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, newBalance: value } : l))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const dirty = lines.filter(
        (l) => l.id && l.newBalance.trim() !== "" && !Number.isNaN(Number(l.newBalance))
      );
      if (dirty.length === 0) {
        throw new Error("Enter at least one new balance.");
      }

      const updates: {
        pocketId: string;
        currency: string;
        balance: string;
      }[] = [];

      // Sequential to keep the dialog feedback simple. Each call is a tiny
      // transaction on its own.
      for (const line of dirty) {
        const res = await fetch(`/api/accounts/${accountId}/snapshots`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            accountCurrencyId: line.id,
            balance: line.newBalance,
            asOf: new Date(asOf).toISOString(),
            note: note || null
          })
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Save failed (${res.status})`);
        }
        updates.push({
          pocketId: line.id!,
          currency: line.currency,
          balance: line.newBalance
        });
      }

      onSaved(updates);
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={`Update balances — ${accountName}`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Record the actual balance for each currency pocket. Use this to
          capture growth, dividends, interest or anything else your scheduled
          items don&apos;t cover. Leave a row blank to skip it.
        </p>

        <div className="space-y-2">
          {lines.map((line, i) => (
            <div
              key={line.id ?? i}
              className="grid grid-cols-[80px_1fr_1fr] items-end gap-3 rounded-md border border-border bg-muted/20 p-3"
            >
              <div className="text-sm font-medium">{line.currency}</div>
              <div className="text-xs text-muted-foreground">
                Current
                <div className="tabular text-foreground">
                  {formatMoney(line.currentBalance, line.currency)}
                </div>
              </div>
              <FormField label="New balance">
                <Input
                  type="number"
                  step="0.01"
                  value={line.newBalance}
                  onChange={(e) => setLine(i, e.target.value)}
                  placeholder={line.currentBalance}
                  disabled={!line.id}
                />
              </FormField>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="As of">
            <Input
              type="date"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              required
            />
          </FormField>
          <FormField label="Note" hint="Optional">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Q1 dividend payout"
              rows={2}
            />
          </FormField>
        </div>

        {history.length > 0 && (
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground">
              {loadingHistory
                ? "Loading history…"
                : `Recent snapshots (${history.length})`}
            </summary>
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs">
              {history.slice(0, 25).map((h) => (
                <li
                  key={h.id}
                  className="flex items-center justify-between border-b border-border/50 py-1 last:border-0"
                >
                  <span className="text-muted-foreground">
                    {new Date(h.asOf).toLocaleDateString("de-CH")} ·{" "}
                    {h.currency}
                  </span>
                  <span className="tabular">
                    {formatMoney(h.balance, h.currency)} {h.currency}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}

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
            {submitting ? "Recording…" : "Record snapshot"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
