import Link from "next/link";
import { Suspense } from "react";
import { SignInForm } from "./signin-form";
import { loadAdminConfig } from "@/lib/admin-config";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const cfg = await loadAdminConfig();
  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-semibold">Welcome back</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to continue to your budget.
          </p>
        </div>
        <Suspense fallback={null}>
          <SignInForm />
        </Suspense>
        <div className="text-center text-sm text-muted-foreground">
          {cfg.authConfig.signupEnabled ? (
            <>
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="text-primary underline-offset-4 hover:underline">
                Create one — free plan
              </Link>
            </>
          ) : (
            <>Sign-up is currently invitation-only.</>
          )}
          <div className="mt-2">
            <Link
              href="/forgot-password"
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              Forgot your password?
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
