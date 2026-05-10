import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isEmailVerificationGateActive } from "@/lib/auth-policy";
import { VerifyEmailRequestCard } from "./verify-email-request-card";

export const dynamic = "force-dynamic";

export default async function VerifyEmailRequestPage() {
  const ctx = await getSession();
  if (!ctx) redirect("/signin?next=/verify-email");
  if (!(await isEmailVerificationGateActive(ctx.user))) redirect("/");

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <VerifyEmailRequestCard email={ctx.user.email} />
    </div>
  );
}
