"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import type { AdminUserAccess } from "@/lib/admin-users";
import { PRODUCT_PLANS, PRODUCT_TIERS, type ProductTier } from "@/lib/plans";
import { apiErrorMessage, readApiObject } from "@/lib/client-response";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

type AccessDraft = Pick<AdminUserAccess, "productTier" | "active">;

function draftFrom(user: AdminUserAccess): AccessDraft {
  return {
    productTier: user.productTier,
    active: user.active
  };
}

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString();
}

export function AdminUsersTable({
  initialUsers
}: {
  initialUsers: AdminUserAccess[];
}) {
  const [users, setUsers] = useState(initialUsers);
  const [drafts, setDrafts] = useState<Record<string, AccessDraft>>(() =>
    Object.fromEntries(initialUsers.map((user) => [user.id, draftFrom(user)]))
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedEmail, setSavedEmail] = useState<string | null>(null);

  function draftFor(user: AdminUserAccess) {
    return drafts[user.id] ?? draftFrom(user);
  }

  function updateDraft(userId: string, patch: Partial<AccessDraft>) {
    setDrafts((current) => ({
      ...current,
      [userId]: {
        ...(current[userId] ?? { productTier: "core", active: true }),
        ...patch
      }
    }));
  }

  function isChanged(user: AdminUserAccess) {
    const draft = draftFor(user);
    return draft.productTier !== user.productTier || draft.active !== user.active;
  }

  async function save(user: AdminUserAccess) {
    const draft = draftFor(user);
    setSavingId(user.id);
    setError(null);
    setSavedEmail(null);
    try {
      const path = `/api/admin/users/${encodeURIComponent(user.id)}/access`;
      const res = await fetch(path, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft)
      });
      const json = await readApiObject(res, path);
      if (!res.ok) {
        throw new Error(apiErrorMessage(json, "User access update failed"));
      }
      const updated = json.user as AdminUserAccess;
      setUsers((current) =>
        current.map((row) => (row.id === updated.id ? updated : row))
      );
      setDrafts((current) => ({
        ...current,
        [updated.id]: draftFrom(updated)
      }));
      setSavedEmail(updated.email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "User access update failed");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Card className="max-w-6xl">
      <CardHeader>
        <CardTitle>User access</CardTitle>
        <CardDescription>
          Grant plan access manually and suspend or reactivate user accounts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {users.length === 0 ? (
          <p className="text-sm text-muted-foreground">No users found.</p>
        ) : (
          <div className="rounded-md border border-border">
            <Table>
              <THead>
                <TR>
                  <TH className="min-w-[16rem]">User</TH>
                  <TH>Role</TH>
                  <TH className="min-w-[11rem]">Plan</TH>
                  <TH>Status</TH>
                  <TH>Households</TH>
                  <TH>Sessions</TH>
                  <TH>Last sign-in</TH>
                  <TH className="text-right">Action</TH>
                </TR>
              </THead>
              <TBody>
                {users.map((user) => {
                  const draft = draftFor(user);
                  const saving = savingId === user.id;
                  return (
                    <TR key={user.id}>
                      <TD>
                        <div className="space-y-1">
                          <p className="break-all font-medium">{user.email}</p>
                          <div className="flex flex-wrap gap-1">
                            <Badge
                              variant={user.emailVerifiedAt ? "success" : "warning"}
                            >
                              {user.emailVerifiedAt ? "Verified" : "Unverified"}
                            </Badge>
                            <Badge variant={user.active ? "success" : "warning"}>
                              {user.active ? "Active" : "Suspended"}
                            </Badge>
                          </div>
                        </div>
                      </TD>
                      <TD>
                        <Badge variant={user.role === "admin" ? "default" : "outline"}>
                          {user.role}
                        </Badge>
                      </TD>
                      <TD>
                        <Select
                          value={draft.productTier}
                          onChange={(e) =>
                            updateDraft(user.id, {
                              productTier: e.target.value as ProductTier
                            })
                          }
                          disabled={saving}
                        >
                          {PRODUCT_TIERS.map((tier) => (
                            <option key={tier} value={tier}>
                              {PRODUCT_PLANS[tier].shortName}
                            </option>
                          ))}
                        </Select>
                      </TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={draft.active}
                            onCheckedChange={(active) =>
                              updateDraft(user.id, { active })
                            }
                            disabled={saving}
                            ariaLabel={`Set ${user.email} active status`}
                          />
                          <span className="text-sm">
                            {draft.active ? "Active" : "Suspended"}
                          </span>
                        </div>
                      </TD>
                      <TD className="tabular">{user.membershipCount}</TD>
                      <TD className="tabular">{user.sessionCount}</TD>
                      <TD className="whitespace-nowrap text-muted-foreground">
                        {formatDate(user.lastSignInAt)}
                      </TD>
                      <TD className="text-right">
                        <Button
                          size="sm"
                          onClick={() => save(user)}
                          disabled={saving || !isChanged(user)}
                        >
                          <Save className="h-4 w-4" />
                          {saving ? "Saving..." : "Save"}
                        </Button>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        {savedEmail && (
          <p className="text-xs text-muted-foreground">
            Saved access for {savedEmail}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
