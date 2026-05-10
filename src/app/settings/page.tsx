import { prisma } from "@/lib/prisma";
import { getActiveHouseholdForPage } from "@/lib/page-auth";
import { PageHeader } from "@/components/page-header";
import {
  HouseholdSettingsForm,
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

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const household = await getActiveHouseholdForPage("/settings");
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
          <HouseholdSettingsForm
            initial={{
              name: household.name,
              baseCurrency: household.baseCurrency
            }}
          />
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
