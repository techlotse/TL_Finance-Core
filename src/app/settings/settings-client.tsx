"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

export function HouseholdSettingsForm({
  initial
}: {
  initial: { name: string; baseCurrency: string };
}) {
  const router = useRouter();
  const [form, setForm] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/household", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          baseCurrency: form.baseCurrency.toUpperCase()
        })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      setSavedAt(Date.now());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Household</CardTitle>
        <CardDescription>
          Display name and base currency for all reports.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Household name">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </FormField>
          <FormField label="Base currency">
            <Input
              value={form.baseCurrency}
              onChange={(e) =>
                setForm({ ...form, baseCurrency: e.target.value.toUpperCase() })
              }
              maxLength={3}
            />
          </FormField>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
          {savedAt && (
            <span className="text-xs text-muted-foreground">
              Saved {new Date(savedAt).toLocaleTimeString("de-CH")}
            </span>
          )}
          {error && <span className="text-xs text-destructive">{error}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

interface IncomeEarner {
  id: string;
  name: string;
  notes: string | null;
  active: boolean;
}

export function IncomeEarnersCard({
  initialEarners
}: {
  initialEarners: IncomeEarner[];
}) {
  const router = useRouter();
  const [earners, setEarners] = React.useState<IncomeEarner[]>(initialEarners);
  const [newName, setNewName] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState("");

  async function addEarner() {
    if (!newName.trim()) return;
    const res = await fetch("/api/income-earners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() })
    });
    if (res.ok) {
      const created = await res.json();
      setEarners((prev) => [...prev, created]);
      setNewName("");
      router.refresh();
    }
  }

  function startEdit(e: IncomeEarner) {
    setEditingId(e.id);
    setEditingName(e.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingName("");
  }

  async function saveRename() {
    if (!editingId || !editingName.trim()) return;
    const res = await fetch(`/api/income-earners/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editingName.trim() })
    });
    if (res.ok) {
      setEarners((prev) =>
        prev.map((p) =>
          p.id === editingId ? { ...p, name: editingName.trim() } : p
        )
      );
      cancelEdit();
      router.refresh();
    }
  }

  async function toggleActive(id: string, next: boolean) {
    await fetch(`/api/income-earners/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: next })
    });
    setEarners((prev) =>
      prev.map((e) => (e.id === id ? { ...e, active: next } : e))
    );
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Deactivate this earner?")) return;
    await fetch(`/api/income-earners/${id}`, { method: "DELETE" });
    setEarners((prev) =>
      prev.map((e) => (e.id === id ? { ...e, active: false } : e))
    );
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Income earners</CardTitle>
        <CardDescription>
          One or two earners is typical. Income items can be assigned to any of
          these. Click the pencil to rename.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {earners.length === 0 && (
            <li className="py-3 text-sm text-muted-foreground">
              No earners yet.
            </li>
          )}
          {earners.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between py-3"
            >
              {editingId === e.id ? (
                <div className="flex flex-1 items-center gap-2">
                  <Input
                    autoFocus
                    value={editingName}
                    onChange={(ev) => setEditingName(ev.target.value)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter") {
                        ev.preventDefault();
                        saveRename();
                      }
                      if (ev.key === "Escape") cancelEdit();
                    }}
                    className="max-w-xs"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={saveRename}
                    aria-label="Save"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={cancelEdit}
                    aria-label="Cancel"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{e.name}</span>
                    {!e.active && <Badge variant="outline">Inactive</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => startEdit(e)}
                      aria-label="Rename"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Switch
                      checked={e.active}
                      onCheckedChange={(v) => toggleActive(e.id, v)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(e.id)}
                      aria-label="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-end gap-2">
          <FormField label="Add an earner" className="flex-1">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Person 3"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addEarner();
                }
              }}
            />
          </FormField>
          <Button onClick={addEarner}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface CategoryRow {
  id: string;
  name: string;
  type: string;
  groupId: string;
}
interface GroupRow {
  id: string;
  name: string;
  categories: CategoryRow[];
}

export function CategoriesCard({
  initialGroups
}: {
  initialGroups: GroupRow[];
}) {
  const router = useRouter();
  const [groups, setGroups] = React.useState<GroupRow[]>(initialGroups);
  const [newGroupName, setNewGroupName] = React.useState("");
  const [editingGroupId, setEditingGroupId] = React.useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = React.useState("");
  const [editingCatId, setEditingCatId] = React.useState<string | null>(null);
  const [editingCatName, setEditingCatName] = React.useState("");
  const [newCat, setNewCat] = React.useState<{
    groupId: string;
    name: string;
    type: string;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function addGroup() {
    setError(null);
    if (!newGroupName.trim()) return;
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "group", data: { name: newGroupName.trim() } })
    });
    if (res.ok) {
      const created = await res.json();
      setGroups((prev) => [...prev, { ...created, categories: [] }]);
      setNewGroupName("");
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not add group");
    }
  }

  async function renameGroup() {
    if (!editingGroupId || !editingGroupName.trim()) return;
    const res = await fetch(`/api/category-groups/${editingGroupId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editingGroupName.trim() })
    });
    if (res.ok) {
      setGroups((prev) =>
        prev.map((g) =>
          g.id === editingGroupId ? { ...g, name: editingGroupName.trim() } : g
        )
      );
      setEditingGroupId(null);
      setEditingGroupName("");
      router.refresh();
    }
  }

  async function deleteGroup(id: string) {
    setError(null);
    if (!confirm("Delete this group? It must be empty first.")) return;
    const res = await fetch(`/api/category-groups/${id}`, { method: "DELETE" });
    if (res.ok) {
      setGroups((prev) => prev.filter((g) => g.id !== id));
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not delete group");
    }
  }

  async function addCategory() {
    if (!newCat || !newCat.name.trim() || !newCat.groupId) return;
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "category",
        data: {
          groupId: newCat.groupId,
          name: newCat.name.trim(),
          type: newCat.type
        }
      })
    });
    if (res.ok) {
      const created = await res.json();
      setGroups((prev) =>
        prev.map((g) =>
          g.id === newCat.groupId
            ? { ...g, categories: [...g.categories, created] }
            : g
        )
      );
      setNewCat(null);
      router.refresh();
    }
  }

  async function renameCategory() {
    if (!editingCatId || !editingCatName.trim()) return;
    const res = await fetch(`/api/categories/${editingCatId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editingCatName.trim() })
    });
    if (res.ok) {
      setGroups((prev) =>
        prev.map((g) => ({
          ...g,
          categories: g.categories.map((c) =>
            c.id === editingCatId ? { ...c, name: editingCatName.trim() } : c
          )
        }))
      );
      setEditingCatId(null);
      setEditingCatName("");
      router.refresh();
    }
  }

  async function deleteCategory(id: string) {
    setError(null);
    if (!confirm("Delete this category?")) return;
    const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
    if (res.ok) {
      setGroups((prev) =>
        prev.map((g) => ({
          ...g,
          categories: g.categories.filter((c) => c.id !== id)
        }))
      );
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not delete category");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Categories</CardTitle>
        <CardDescription>
          Group budget items. Editing here updates the dropdowns on the Budget
          page. Categories that still have active items can&apos;t be deleted.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <p className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.id} className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                {editingGroupId === g.id ? (
                  <div className="flex flex-1 items-center gap-2">
                    <Input
                      autoFocus
                      value={editingGroupName}
                      onChange={(e) => setEditingGroupName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          renameGroup();
                        }
                        if (e.key === "Escape") setEditingGroupId(null);
                      }}
                      className="max-w-xs"
                    />
                    <Button variant="ghost" size="icon" onClick={renameGroup}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditingGroupId(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      {g.name}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingGroupId(g.id);
                          setEditingGroupName(g.name);
                        }}
                        aria-label="Rename group"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteGroup(g.id)}
                        aria-label="Delete group"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                )}
              </div>

              <ul className="mt-2 divide-y divide-border">
                {g.categories.length === 0 && (
                  <li className="py-2 text-sm text-muted-foreground">
                    No categories yet.
                  </li>
                )}
                {g.categories.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between py-2"
                  >
                    {editingCatId === c.id ? (
                      <div className="flex flex-1 items-center gap-2">
                        <Input
                          autoFocus
                          value={editingCatName}
                          onChange={(e) => setEditingCatName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              renameCategory();
                            }
                            if (e.key === "Escape") setEditingCatId(null);
                          }}
                          className="max-w-xs"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={renameCategory}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingCatId(null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <span>{c.name}</span>
                          <Badge variant="outline" className="capitalize">
                            {c.type}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditingCatId(c.id);
                              setEditingCatName(c.name);
                            }}
                            aria-label="Rename category"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteCategory(c.id)}
                            aria-label="Delete category"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>

              {newCat?.groupId === g.id ? (
                <div className="mt-2 flex items-end gap-2">
                  <FormField label="Name" className="flex-1">
                    <Input
                      autoFocus
                      value={newCat.name}
                      onChange={(e) =>
                        setNewCat({ ...newCat, name: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addCategory();
                        }
                      }}
                    />
                  </FormField>
                  <FormField label="Type">
                    <Select
                      value={newCat.type}
                      onChange={(e) =>
                        setNewCat({ ...newCat, type: e.target.value })
                      }
                    >
                      <option value="expense">Expense</option>
                      <option value="income">Income</option>
                      <option value="transfer">Transfer</option>
                      <option value="investment">Investment</option>
                    </Select>
                  </FormField>
                  <Button onClick={addCategory}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setNewCat(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() =>
                    setNewCat({ groupId: g.id, name: "", type: "expense" })
                  }
                >
                  <Plus className="h-3 w-3" /> Add category
                </Button>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-end gap-2 border-t border-border pt-4">
          <FormField label="Add a group" className="flex-1">
            <Input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="e.g. Hobbies"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addGroup();
                }
              }}
            />
          </FormField>
          <Button onClick={addGroup}>
            <Plus className="h-4 w-4" /> Add group
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ExchangeRateStatusCard({
  status
}: {
  status: { provider: string; baseUrl: string; lastSync: string | null };
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Exchange rate provider</CardTitle>
        <CardDescription>
          Cached daily into the database; falls back to last known rate if the
          provider is unreachable.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Provider
            </dt>
            <dd className="font-medium capitalize">{status.provider}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Base URL
            </dt>
            <dd className="font-medium break-all">{status.baseUrl}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Last sync
            </dt>
            <dd className="font-medium">
              {status.lastSync
                ? new Date(status.lastSync).toLocaleString("de-CH")
                : "Never"}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
