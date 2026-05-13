import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import {
  HouseholdSettingsForm,
  HouseholdMembershipsCard,
  IncomeEarnersCard,
  CategoriesCard,
  ExchangeRateStatusCard
} from "./settings-client";
import { ImportExportCard } from "./import-export-card";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { SettingsTabs } from "./settings-tabs";
import { requirePageSession } from "@/lib/page-auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ctx = await requirePageSession("/settings");
  const membership = ctx.membership;
  if (!membership) redirect("/onboarding");
  const household = membership.household;
  const [earners, groups, latestRate] = await Promise.all([
    prisma.incomeEarner.findMany({
      where: { householdId: household.id, deletedAt: null },
      orderBy: { createdAt: "asc" }
    }),
    prisma.categoryGroup.findMany({
      where: { householdId: household.id, deletedAt: null },
      orderBy: { sortOrder: "asc" },
      include: {
        categories: {
          where: { deletedAt: null },
          orderBy: { sortOrder: "asc" }
        }
      }
    }),
    prisma.exchangeRate.findFirst({
      orderBy: { createdAt: "desc" }
    })
  ]);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Household, theme, exchange-rate configuration and data backup."
      />

      <SettingsTabs
        household={
          <div className="space-y-4">
            <HouseholdSettingsForm
              initial={{
                name: household.name,
                baseCurrency: household.baseCurrency
              }}
            />
            <HouseholdMembershipsCard
              activeMembershipId={membership.id}
              memberships={ctx.memberships.map((m) => ({
                id: m.id,
                householdName: m.household.name,
                baseCurrency: m.household.baseCurrency,
                role: m.role
              }))}
            />
          </div>
        }
        earners={
          <IncomeEarnersCard
            initialEarners={earners.map((e) => ({
              id: e.id,
              name: e.name,
              notes: e.notes,
              active: e.active
            }))}
          />
        }
        categories={
          <CategoriesCard
            initialGroups={groups.map((g) => ({
              id: g.id,
              name: g.name,
              categories: g.categories.map((c) => ({
                id: c.id,
                name: c.name,
                type: c.type,
                groupId: g.id
              }))
            }))}
          />
        }
        preferences={
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Theme</CardTitle>
                <CardDescription>
                  Light, dark, or follow your system preference.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ThemeToggle />
              </CardContent>
            </Card>

            <ExchangeRateStatusCard
              status={{
                provider: process.env.EXCHANGE_RATE_PROVIDER || "frankfurter",
                baseUrl:
                  process.env.FRANKFURTER_BASE_URL ||
                  "https://api.frankfurter.app",
                lastSync: latestRate?.createdAt.toISOString() ?? null
              }}
            />
          </div>
        }
        backup={<ImportExportCard />}
      />
    </>
  );
}
