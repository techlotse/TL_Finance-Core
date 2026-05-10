import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-password-form";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-semibold">Forgot your password?</h1>
          <p className="text-sm text-muted-foreground">
            Enter your email and we&apos;ll send you a reset link.
          </p>
        </div>
        <ForgotPasswordForm />
        <div className="text-center text-sm text-muted-foreground">
          <Link href="/signin" className="text-primary underline-offset-4 hover:underline">
            Back to sign-in
          </Link>
        </div>
      </div>
    </div>
  );
}
