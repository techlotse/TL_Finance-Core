import Link from "next/link";
import { ResetPasswordForm } from "./reset-password-form";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-semibold">Choose a new password</h1>
          <p className="text-sm text-muted-foreground">
            Pick something at least 10 characters. We&apos;ll sign you out
            everywhere when you finish.
          </p>
        </div>
        <ResetPasswordForm token={token} />
        <div className="text-center text-sm text-muted-foreground">
          <Link href="/signin" className="text-primary underline-offset-4 hover:underline">
            Back to sign-in
          </Link>
        </div>
      </div>
    </div>
  );
}
