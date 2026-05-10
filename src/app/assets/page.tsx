import { prisma } from "@/lib/prisma";
import { getActiveHouseholdForPage } from "@/lib/page-auth";
import { PageHeader } from "@/components/page-header";
import { AssetsClient, type AssetRow } from "./assets-client";

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  const household = await getActiveHouseholdForPage("/assets");
  const assets = await prisma.asset.findMany({
    where: { householdId: household.id, deletedAt: null },
    orderBy: { createdAt: "asc" }
  });

  const rows: AssetRow[] = assets.map((a) => ({
    id: a.id,
    name: a.name,
    category: a.category,
    value: a.value.toString(),
    currency: a.currency,
    annualAppreciationRate: a.annualAppreciationRate.toString(),
    acquiredAt: a.acquiredAt?.toISOString() ?? null,
    notes: a.notes,
    active: a.active
  }));

  return (
    <>
      <PageHeader
        title="Assets"
        description="Track non-bank wealth — property, vehicles, jewelry, gold — with appreciation or depreciation."
      />
      <AssetsClient
        initial={rows}
        baseCurrency={household.baseCurrency}
      />
    </>
  );
}
