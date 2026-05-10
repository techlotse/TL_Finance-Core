"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const CONSENT_KEY = "tlfc.cookieConsent.v1";

type Consent = {
  necessary: true;
  analytics: boolean;
  decidedAt: string;
};

/**
 * Minimal first-party cookie banner. We only ship strictly necessary cookies
 * today (the session cookie + theme preference); analytics is opt-in for the
 * day we add it. Stored in localStorage rather than a cookie so the banner
 * itself doesn't write any cookies.
 */
export function CookieBanner() {
  const [open, setOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CONSENT_KEY);
      if (!raw) {
        setOpen(true);
      }
    } catch {
      // localStorage may be unavailable (private browsing, SSR edge cases).
      // In that case we don't display the banner — the user gets default
      // necessary-only behaviour.
    }
  }, []);

  function persist(consent: Consent) {
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
    } catch {
      // ignore — see above
    }
    setOpen(false);
  }

  function acceptAll() {
    persist({ necessary: true, analytics: true, decidedAt: new Date().toISOString() });
  }

  function necessaryOnly() {
    persist({ necessary: true, analytics: false, decidedAt: new Date().toISOString() });
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie preferences"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="space-y-1">
          <p className="font-medium">We use a small number of cookies</p>
          <p className="text-muted-foreground">
            Strictly necessary cookies keep you signed in and remember your theme.
            We don&apos;t use advertising or tracking cookies. See our{" "}
            <Link href="/legal/cookies" className="underline">
              Cookie Policy
            </Link>{" "}
            and{" "}
            <Link href="/legal/privacy" className="underline">
              Privacy Notice
            </Link>
            .
          </p>
          {showDetails && (
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              <li>
                <strong>Necessary</strong> — session cookie, theme preference.
                Always on.
              </li>
              <li>
                <strong>Analytics</strong> — none deployed today; this toggle is
                a placeholder for any opt-in metric collection we add later.
              </li>
            </ul>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowDetails((s) => !s)}
          >
            {showDetails ? "Hide details" : "Details"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={necessaryOnly}>
            Necessary only
          </Button>
          <Button type="button" size="sm" onClick={acceptAll}>
            Accept all
          </Button>
        </div>
      </div>
    </div>
  );
}
