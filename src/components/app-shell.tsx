import { getSession } from "@/lib/auth";
import { Nav, MobileNav } from "./nav";

/**
 * Server component that resolves the current user role and renders the nav.
 * Lives between RootLayout and the per-page server components so the role
 * lookup happens once per request, not in every page.
 */
/**
 * App shell layout.
 *
 * Desktop (≥md):  sticky left nav (full viewport height, doesn't scroll)
 *                 + scrollable main column on the right.
 * Mobile (<md):   nav collapses into a sticky top bar; the page scrolls
 *                 normally underneath it.
 *
 * The "stick the nav" trick is `position: sticky; top: 0; height: 100vh`
 * on the aside itself — keeps it inside the document flow (so the rest of
 * the layout still works) but it doesn't move with scroll.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const ctx = await getSession();
  const isAdmin = ctx?.user.role === "admin";
  const productTier = ctx?.user.productTier ?? "core";
  // Surface the household list + active selection to the nav so the
  // switcher can render. We pass plain serialisable rows — never the
  // Prisma objects — so this stays a server-component → client-component
  // boundary.
  const memberships =
    ctx?.memberships.map((m) => ({
      id: m.id,
      householdId: m.householdId,
      householdName: m.household.name,
      role: m.role
    })) ?? [];
  const activeMembershipId = ctx?.membership?.id ?? null;
  return (
    <div className="flex min-h-screen">
      <Nav
        isAdmin={isAdmin}
        memberships={memberships}
        activeMembershipId={activeMembershipId}
        productTier={productTier}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav
          memberships={memberships}
          activeMembershipId={activeMembershipId}
          productTier={productTier}
        />
        <main className="flex-1 px-4 py-6 sm:px-6 md:px-10 md:py-8">
          {/* Style guide: max-width 1200px, 8px grid (py-8 = 32px = 4×8) */}
          <div className="mx-auto w-full max-w-brand-layout">{children}</div>
        </main>
      </div>
    </div>
  );
}
