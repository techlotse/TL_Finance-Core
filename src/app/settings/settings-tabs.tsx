"use client";

import * as React from "react";
import {
  Home,
  Users,
  FolderTree,
  Sliders,
  Database
} from "lucide-react";
import { cn } from "@/lib/utils";

type TabId = "household" | "earners" | "categories" | "preferences" | "backup";

const TABS: Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "household", label: "Household", icon: Home },
  { id: "earners", label: "Income earners", icon: Users },
  { id: "categories", label: "Categories", icon: FolderTree },
  { id: "preferences", label: "Preferences", icon: Sliders },
  { id: "backup", label: "Backup status", icon: Database }
];

const STORAGE_KEY = "bp.settingsTab.v1";

/**
 * Tabbed settings layout.
 *
 * Each child slot is rendered into its own tab panel; the parent server
 * page hands them in pre-rendered so we don't have to convert any of the
 * settings cards. The selected tab is persisted to localStorage so a
 * refresh keeps you where you were.
 */
export function SettingsTabs({
  household,
  earners,
  categories,
  preferences,
  backup
}: {
  household: React.ReactNode;
  earners: React.ReactNode;
  categories: React.ReactNode;
  preferences: React.ReactNode;
  backup: React.ReactNode;
}) {
  const [active, setActive] = React.useState<TabId>("household");

  // Restore last-active tab on mount. We don't read this from localStorage
  // synchronously to avoid hydration mismatches.
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && TABS.some((t) => t.id === stored)) {
        setActive(stored as TabId);
      }
    } catch {
      // ignore (private browsing / SSR edge cases)
    }
  }, []);

  function selectTab(id: TabId) {
    setActive(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-4">
      {/* Tab strip — sticks just under the page header so it stays visible
          while a long card scrolls in the panel below. */}
      <div
        className="sticky top-0 z-10 -mx-4 flex flex-wrap gap-1 border-b border-border bg-background px-4 py-2 sm:-mx-6 sm:px-6 md:-mx-10 md:px-10"
        role="tablist"
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => selectTab(t.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel">
        {active === "household" && household}
        {active === "earners" && earners}
        {active === "categories" && categories}
        {active === "preferences" && preferences}
        {active === "backup" && backup}
      </div>
    </div>
  );
}
