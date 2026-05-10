"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Home, Car, Gem, Star, Coins, Cpu, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatMoney, formatPercent } from "@/lib/money";

type AssetCategory =
  | "property"
  | "vehicle"
  | "jewelry"
  | "collectible"
  | "precious_metal"
  | "electronics"
  | "other";

export interface AssetRow {
  id: string;
  name: string;
  category: AssetCategory;
  value: string;
  currency: string;
  /** Signed: 0.04 = +4%/yr, -0.15 = -15%/yr (depreciation). */
  annualAppreciationRate: string;
  acquiredAt: string | null;
  notes: string | null;
  active: boolean;
}

const CATEGORY_LABELS: Record<AssetCategory, string> = {
  property: "Property",
  vehicle: "Vehicle",
  jewelry: "Jewelry",
  collectible: "Collectible",
  precious_metal: "Precious metal",
  electronics: "Electronics",
  other: "Other"
};

const CATEGORY_ICONS: Record<AssetCategory, React.ComponentType<{ className?: string }>> = {
  property: Home,
  vehicle: Car,
  jewelry: Gem,
  collectible: Star,
  precious_metal: Coins,
  electronics: Cpu,
  other: Package
};

export function AssetsClient({
  initial,
  baseCurrency
}: {
  initial: AssetRow[];
  baseCurrency: string;
}) {
  const router = useRouter();
  const [assets, setAssets] = React.useState<AssetRow[]>(initial);
  const [editing, setEditing] = React.useState<AssetRow | null>(null);
  const [creating, setCreating] = React.useState(false);

  async function handleDelete(id: string) {
    if (!confirm("Remove this asset?")) return;
    await fetch(`/api/assets/${id}`, { method: "DELETE" });
    setAssets((prev) => prev.filter((a) => a.id !== id));
    router.refresh();
  }

  // Group by category for visual hierarchy.
  const grouped = new Map<AssetCategory, AssetRow[]>();
  for (const a of assets) {
    if (!grouped.has(a.category)) grouped.set(a.category, []);
    grouped.get(a.category)!.push(a);
  }

  // Cross-currency total in base — naive single-currency total when all assets
  // share the same currency; mixed currencies surface a warning.
  const totalsByCurrency = new Map<string, number>();
  for (const a of assets) {
    totalsByCurrency.set(
      a.currency,
      (totalsByCurrency.get(a.currency) ?? 0) + Number(a.value)
    );
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {assets.length === 0 ? (
            "No assets yet."
          ) : (
            <span>
              Total value:{" "}
              {Array.from(totalsByCurrency.entries())
                .map(([cur, t]) => `${formatMoney(t, cur)} ${cur}`)
                .join(", ")}
            </span>
          )}
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> New asset
        </Button>
      </div>

      {assets.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            Track property, vehicles, jewelry or precious metals you own.
            Each asset can appreciate or depreciate over time and feeds into
            net-worth views.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([category, rows]) => {
            const Icon = CATEGORY_ICONS[category];
            return (
              <Card key={category}>
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                    {CATEGORY_LABELS[category]}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <ul className="divide-y divide-border">
                    {rows.map((a) => (
                      <li
                        key={a.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-3"
                      >
                        <div className="min-w-0 space-y-1">
                          <p className="font-medium">{a.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatMoney(a.value, a.currency)} {a.currency} ·{" "}
                            {Number(a.annualAppreciationRate) >= 0 ? (
                              <Badge variant="success">
                                {formatPercent(a.annualAppreciationRate)} / yr
                              </Badge>
                            ) : (
                              <Badge variant="destructive">
                                {formatPercent(a.annualAppreciationRate)} / yr
                              </Badge>
                            )}
                            {a.acquiredAt &&
                              " · acquired " +
                                new Date(a.acquiredAt).toLocaleDateString(
                                  "de-CH"
                                )}
                          </p>
                          {a.notes && (
                            <p className="text-xs text-muted-foreground">
                              {a.notes}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
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
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {(creating || editing) && (
        <AssetFormDialog
          open={creating || editing !== null}
          existing={editing}
          baseCurrency={baseCurrency}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={(saved) => {
            if (editing) {
              setAssets((prev) =>
                prev.map((a) => (a.id === saved.id ? saved : a))
              );
            } else {
              setAssets((prev) => [...prev, saved]);
            }
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function AssetFormDialog({
  open,
  existing,
  baseCurrency,
  onClose,
  onSaved
}: {
  open: boolean;
  existing: AssetRow | null;
  baseCurrency: string;
  onClose: () => void;
  onSaved: (asset: AssetRow) => void;
}) {
  const [form, setForm] = React.useState({
    name: existing?.name ?? "",
    category: (existing?.category ?? "other") as AssetCategory,
    value: existing?.value ?? "",
    currency: existing?.currency ?? baseCurrency,
    annualAppreciationRate: existing?.annualAppreciationRate ?? "0",
    acquiredAt: existing?.acquiredAt ? existing.acquiredAt.slice(0, 10) : "",
    notes: existing?.notes ?? "",
    active: existing?.active ?? true
  });
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        category: form.category,
        value: form.value,
        currency: form.currency.toUpperCase(),
        annualAppreciationRate: form.annualAppreciationRate,
        acquiredAt: form.acquiredAt
          ? new Date(form.acquiredAt).toISOString()
          : null,
        notes: form.notes || null,
        active: form.active
      };
      const res = await fetch(
        existing ? `/api/assets/${existing.id}` : "/api/assets",
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
        category: saved.category,
        value: saved.value.toString(),
        currency: saved.currency,
        annualAppreciationRate: saved.annualAppreciationRate.toString(),
        acquiredAt: saved.acquiredAt
          ? new Date(saved.acquiredAt).toISOString()
          : null,
        notes: saved.notes,
        active: saved.active
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
      title={existing ? "Edit asset" : "New asset"}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Name">
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            placeholder="Family home, Toyota Yaris, gold ring…"
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Category">
            <Select
              value={form.category}
              onChange={(e) =>
                setForm({ ...form, category: e.target.value as AssetCategory })
              }
            >
              {(Object.keys(CATEGORY_LABELS) as AssetCategory[]).map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Acquired" hint="Optional">
            <Input
              type="date"
              value={form.acquiredAt}
              onChange={(e) =>
                setForm({ ...form, acquiredAt: e.target.value })
              }
            />
          </FormField>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Current value" className="col-span-2">
            <Input
              type="number"
              step="0.01"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
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
        </div>
        <FormField
          label="Annual appreciation / depreciation"
          hint="Signed decimal: 0.04 = +4%/yr, -0.15 = 15% depreciation"
        >
          <Input
            type="number"
            step="0.0001"
            value={form.annualAppreciationRate}
            onChange={(e) =>
              setForm({ ...form, annualAppreciationRate: e.target.value })
            }
            required
          />
        </FormField>
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
