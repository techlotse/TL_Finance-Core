import Link from "next/link";
import { redirect } from "next/navigation";
import { loadAdminConfig } from "@/lib/admin-config";
import { SignUpForm } from "./signup-form";

export const dynamic = "force-dynamic";

export default async function SignUpPage() {
  const cfg = await loadAdminConfig();
  if (!cfg.authConfig.signupEnabled) {
    redirect("/signin");
  }
  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-semibold">Choose your TL Finance plan</h1>
          <p className="text-sm text-muted-foreground">
            Core is included. Smart and AI unlock paid advisory modules.
          </p>
        </div>
        <SignUpForm />
        <div className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/signin" className="text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          By signing up you agree to our{" "}
          <Link href="/legal/terms" className="underline-offset-4 hover:underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/legal/privacy" className="underline-offset-4 hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
