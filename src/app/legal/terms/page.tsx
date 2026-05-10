export default function TermsPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Terms of Service</h1>
      <p className="text-sm text-muted-foreground">
        Last updated: 2026-04-29.
      </p>

      <h2 className="mt-6 text-lg font-semibold">1. The service</h2>
      <p>
        TL Finance Core is a self-hosted household budgeting tool. By
        creating an account on this instance, you agree to use the service in
        good faith and in accordance with applicable law.
      </p>

      <h2 className="mt-6 text-lg font-semibold">2. Free plan</h2>
      <p>
        The free plan is currently the only plan offered. There is no time
        limit, no credit card required, and no advertising. The operator of
        this instance may add paid tiers in future; existing free-plan
        accounts will not be deprived of essential functionality without
        notice.
      </p>

      <h2 className="mt-6 text-lg font-semibold">3. Your data, your call</h2>
      <p>
        Everything you enter — accounts, balances, budget items, projections —
        belongs to you. You can export or delete your household at any time.
        Hard-deleting your account erases personally identifiable information
        and your sessions; aggregated audit-log entries are retained for the
        period stated in our Privacy Notice.
      </p>

      <h2 className="mt-6 text-lg font-semibold">4. Acceptable use</h2>
      <p>
        Don&apos;t try to break, abuse, or scrape this service, and don&apos;t
        use it to store data you don&apos;t have the right to store. The
        operator may suspend any account that does.
      </p>

      <h2 className="mt-6 text-lg font-semibold">5. No warranty</h2>
      <p>
        The service is provided &quot;as is&quot;. While we put real care into
        accuracy of the forecast and money math, you remain responsible for
        your own financial decisions. Don&apos;t treat projections as advice.
      </p>

      <h2 className="mt-6 text-lg font-semibold">6. Changes</h2>
      <p>
        These terms may be updated. Material changes will be surfaced in the
        app. Continued use after a change means you accept it.
      </p>
    </>
  );
}
