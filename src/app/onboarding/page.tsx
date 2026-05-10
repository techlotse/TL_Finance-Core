import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/page-auth";
import { OnboardingWizard } from "./onboarding-wizard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const ctx = await requirePageSession("/onboarding");
  if (ctx.membership) redirect("/");

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-xl space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-semibold">Welcome to TL Finance Core</h1>
          <p className="text-sm text-muted-foreground">
            Let&apos;s set up your household. This takes about a minute.
          </p>
        </div>
        <OnboardingWizard initialEmail={ctx.user.email} />
      </div>
    </div>
  );
}
