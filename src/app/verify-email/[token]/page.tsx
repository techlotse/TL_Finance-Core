import { VerifyEmailForm } from "./verify-email-form";

export const dynamic = "force-dynamic";

/**
 * Landing page hit from the verification link in the user's inbox.
 * Renders a tiny client component that POSTs the token to the consume
 * endpoint and shows success / failure. Public route — no session needed.
 */
export default async function VerifyEmailPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <VerifyEmailForm token={token} />
    </div>
  );
}
