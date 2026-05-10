import Link from "next/link";

export const metadata = {
  title: "Legal - TL Finance Core"
};

export default function LegalLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10">
      <header className="space-y-2">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back
        </Link>
        <nav className="flex flex-wrap gap-3 text-sm">
          <Link href="/legal/terms" className="text-muted-foreground hover:text-foreground">
            Terms of Service
          </Link>
          <Link
            href="/legal/privacy"
            className="text-muted-foreground hover:text-foreground"
          >
            Privacy Notice
          </Link>
          <Link
            href="/legal/cookies"
            className="text-muted-foreground hover:text-foreground"
          >
            Cookie Policy
          </Link>
        </nav>
      </header>
      <article className="prose prose-sm max-w-none dark:prose-invert">
        {children}
      </article>
    </div>
  );
}
