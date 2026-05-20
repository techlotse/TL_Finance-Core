import { redirect } from "next/navigation";
import { loadPublicAdminConfig } from "@/lib/admin-config";
import {
  buildClassicAdvice,
  buildFinancialSnapshot,
  buildSwissBridgeAdvice
} from "@/lib/advice";
import { requirePageSession } from "@/lib/page-auth";
import { hasPlanAtLeast, normaliseProductTier } from "@/lib/plans";
import { PageHeader } from "@/components/page-header";
import { ProductBrandMark } from "@/components/product-brand";
import { AdviceClient } from "./advice-client";

export const dynamic = "force-dynamic";

export default async function AdvicePage() {
  const ctx = await requirePageSession("/advice");
  if (!ctx.membership) redirect("/onboarding");

  const tier = normaliseProductTier(ctx.user.productTier);
  const adminConfig = await loadPublicAdminConfig();

  if (!hasPlanAtLeast(tier, "smart")) {
    return (
      <>
        <PageHeader
          title={
            <span className="inline-flex items-center gap-3">
              <ProductBrandMark tier="smart" />
              Advice
            </span>
          }
          description="Smart and AI advisory modules are paid TL Finance offerings."
        />
        <AdviceClient
          tier={tier}
          baseCurrency={ctx.membership.household.baseCurrency}
          aiConfigured={adminConfig.aiConfig.enabled && adminConfig.aiConfig.apiKeySet}
          classicAdvice={null}
          swissBridgeAdvice={null}
          snapshot={null}
        />
      </>
    );
  }

  const snapshot = await buildFinancialSnapshot(ctx.membership.householdId);
  const classicAdvice = buildClassicAdvice(snapshot);
  const swissBridgeAdvice = buildSwissBridgeAdvice(snapshot);

  return (
    <>
      <PageHeader
        title={
          <span className="inline-flex items-center gap-3">
            <ProductBrandMark tier={tier} />
            Advice
          </span>
        }
        description={`Planning recommendations in ${snapshot.baseCurrency}.`}
      />
      <AdviceClient
        tier={tier}
        baseCurrency={snapshot.baseCurrency}
        aiConfigured={adminConfig.aiConfig.enabled && adminConfig.aiConfig.apiKeySet}
        classicAdvice={classicAdvice}
        swissBridgeAdvice={swissBridgeAdvice}
        snapshot={snapshot}
      />
    </>
  );
}
