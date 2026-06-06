"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Wallet,
  Banknote,
  ArrowLeftRight,
  TrendingUp,
  PiggyBank,
  Landmark,
  Gem,
  BrainCircuit,
  LineChart,
  Settings,
  ShieldCheck,
  LogOut
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";
import { ProductBrandMark, ProductWordmark } from "./product-brand";
import { PRODUCT_PLANS, normaliseProductTier, type ProductTier } from "@/lib/plans";

const ICON_PROPS = { className: "h-4 w-4", strokeWidth: 1.5 } as const;

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}
interface NavGroup {
  label: string | null;
  preview?: boolean;
  items: NavItem[];
}

// Product split: Budgeting (plan) · Analysis (actuals) · Planning (preview).
const NAV_GROUPS: NavGroup[] = [
  { label: null, items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }] },
  { label: "Budgeting", items: [{ href: "/budget", label: "Budget", icon: Wallet }] },
  {
    label: "Analysis",
    items: [
      { href: "/analysis", label: "Analysis", icon: LineChart },
      { href: "/accounts", label: "Bank Accounts", icon: Banknote },
      { href: "/transfers", label: "Transfers", icon: ArrowLeftRight },
      { href: "/assets", label: "Assets", icon: Gem }
    ]
  },
  {
    label: "Planning",
    preview: true,
    items: [
      { href: "/forecast", label: "Forecast", icon: TrendingUp },
      { href: "/investments", label: "Investments", icon: PiggyBank },
      { href: "/debt", label: "Debt", icon: Landmark },
      { href: "/advice", label: "Advice", icon: BrainCircuit }
    ]
  },
  { label: null, items: [{ href: "/settings", label: "Settings", icon: Settings }] }
];

const items = NAV_GROUPS.flatMap((g) => g.items);

const HIDE_NAV_PREFIXES = [
  "/signin",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/onboarding",
  "/legal",
  "/verify-email"
];

function shouldHideNav(pathname: string | null): boolean {
  if (!pathname) return false;
  return HIDE_NAV_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

async function handleSignout() {
  try {
    await fetch("/api/auth/signout", { method: "POST" });
  } catch {
    // best-effort
  }
  window.location.href = "/signin";
}

export interface NavMembership {
  id: string;
  householdId: string;
  householdName: string;
  role: string;
}

export function Nav({
  isAdmin = false,
  memberships = [],
  activeMembershipId = null,
  productTier = "core"
}: {
  isAdmin?: boolean;
  memberships?: NavMembership[];
  activeMembershipId?: string | null;
  productTier?: ProductTier | string | null;
}) {
  const pathname = usePathname();
  const tier = normaliseProductTier(productTier);
  const plan = PRODUCT_PLANS[tier];
  if (shouldHideNav(pathname)) return null;
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-card/40 md:flex">
      <div className="px-5 py-5">
        <Link href="/" className="flex items-center gap-3">
          <ProductBrandMark tier={tier} size={32} />
          <ProductWordmark tier={tier} compact />
        </Link>
      </div>

      {memberships.length > 1 && (
        <HouseholdSwitcher
          memberships={memberships}
          activeMembershipId={activeMembershipId}
        />
      )}

      <nav className="flex-1 overflow-y-auto px-3" aria-label="Main navigation">
        <ul className="space-y-0.5" role="list">
          {NAV_GROUPS.map((group, gi) => (
            <li key={group.label ?? `group-${gi}`}>
              {group.label && (
                <div className="flex items-center gap-2 px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                  {group.label}
                  {group.preview && (
                    <span className="rounded-full bg-amber-500/15 px-1.5 py-[1px] text-[9px] font-medium normal-case tracking-normal text-amber-600 dark:text-amber-400">
                      Preview
                    </span>
                  )}
                </div>
              )}
              <ul className="space-y-0.5" role="list">
                {group.items.map((it) => {
                  const Icon = it.icon;
                  const active =
                    it.href === "/"
                      ? pathname === "/"
                      : pathname?.startsWith(it.href);
                  return (
                    <li key={it.href}>
                      <Link
                        href={it.href}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                          active
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                          group.preview && !active && "opacity-70"
                        )}
                      >
                        <Icon {...ICON_PROPS} />
                        {it.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}

          {isAdmin && (
            <li className="pt-4 mt-4 border-t border-border">
              <Link
                href="/admin"
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  pathname?.startsWith("/admin")
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <ShieldCheck {...ICON_PROPS} />
                Admin
              </Link>
            </li>
          )}
        </ul>
      </nav>

      <div className="p-4 border-t border-border space-y-1">
        <div className="mb-2 rounded-md border border-border bg-background/60 px-3 py-2 text-xs">
          <div className="font-medium">{plan.badgeLabel} plan</div>
          <div className="text-muted-foreground">{plan.navSubtitle}</div>
        </div>
        <ThemeToggle />
        <button
          type="button"
          onClick={handleSignout}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <LogOut {...ICON_PROPS} />
          Sign out
        </button>
      </div>
    </aside>
  );
}

function HouseholdSwitcher({
  memberships,
  activeMembershipId
}: {
  memberships: NavMembership[];
  activeMembershipId: string | null;
}) {
  async function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    try {
      await fetch("/api/household/switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ membershipId: id })
      });
    } catch {
      /* best-effort */
    }
    window.location.reload();
  }
  return (
    <div className="px-3 pb-3">
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        Household
      </label>
      <select
        value={activeMembershipId ?? ""}
        onChange={onChange}
        className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
        aria-label="Switch household"
      >
        {memberships.map((m) => (
          <option key={m.id} value={m.id}>
            {m.householdName}
          </option>
        ))}
      </select>
    </div>
  );
}

export function MobileNav({
  memberships = [],
  activeMembershipId = null,
  productTier = "core"
}: {
  memberships?: NavMembership[];
  activeMembershipId?: string | null;
  productTier?: ProductTier | string | null;
}) {
  const pathname = usePathname();
  const tier = normaliseProductTier(productTier);
  const plan = PRODUCT_PLANS[tier];
  if (shouldHideNav(pathname)) return null;
  return (
    <nav
      className="md:hidden sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      aria-label="Mobile navigation"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <ProductBrandMark tier={tier} size={28} />
          <span className="text-sm font-semibold tracking-tight">
            {plan.name}
          </span>
        </Link>
        <ThemeToggle />
      </div>
      {memberships.length > 1 && (
        <div className="border-t border-border px-4 py-2">
          <HouseholdSwitcher
            memberships={memberships}
            activeMembershipId={activeMembershipId}
          />
        </div>
      )}
      <div className="overflow-x-auto border-t border-border">
        <ul className="flex min-w-full" role="list">
          {items.map((it) => {
            const Icon = it.icon;
            const active =
              it.href === "/"
                ? pathname === "/"
                : pathname?.startsWith(it.href);
            return (
              <li key={it.href} className="shrink-0">
                <Link
                  href={it.href}
                  className={cn(
                    "flex items-center gap-1 px-3 py-2 text-xs font-medium",
                    active ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
                  {it.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
