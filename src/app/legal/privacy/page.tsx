export default function PrivacyPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Privacy Notice</h1>
      <p className="text-sm text-muted-foreground">
        Last updated: 2026-04-29.
      </p>

      <h2 className="mt-6 text-lg font-semibold">What we store</h2>
      <ul>
        <li>
          <strong>Account data</strong> — your email address and a bcrypt hash
          of your password (we never see the plaintext).
        </li>
        <li>
          <strong>Household data</strong> — names of bank accounts, balances,
          budget items, transfers and projections you enter. This is your data;
          we host it, we don&apos;t mine it.
        </li>
        <li>
          <strong>Sessions</strong> — a SHA-256 hash of your session token, an
          IP-hash (truncated SHA-256, not the IP itself), the user-agent string,
          and last-seen timestamp. Used to rate-limit suspicious activity and
          let you sign out everywhere.
        </li>
        <li>
          <strong>Audit log</strong> — append-only record of who created /
          updated / deleted what (and when), without the values themselves.
          Surfaced to admins only.
        </li>
      </ul>

      <h2 className="mt-6 text-lg font-semibold">What we don&apos;t store</h2>
      <ul>
        <li>Your raw IP address.</li>
        <li>Your password.</li>
        <li>Browser fingerprints, device IDs, or third-party tracking pixels.</li>
        <li>Marketing or advertising cookies.</li>
      </ul>

      <h2 className="mt-6 text-lg font-semibold">Third parties</h2>
      <p>
        Exchange-rate lookups go to{" "}
        <a href="https://www.frankfurter.app" rel="noreferrer">Frankfurter</a>{" "}
        (no account-identifying data is sent). When the admin enables
        S3-compatible backups or SMTP email delivery, those providers
        necessarily see the encrypted backup blobs / emails being sent. No
        other third party sees your data.
      </p>

      <h2 className="mt-6 text-lg font-semibold">Your rights</h2>
      <p>
        You can access, correct, export, or delete your data at any time
        through the app or by emailing the instance operator. Deleting your
        account purges your personal data and household; audit-log entries
        referencing your former user id are retained for the configured
        retention window so the security log stays usable.
      </p>

      <h2 className="mt-6 text-lg font-semibold">Security</h2>
      <p>
        Data is stored encrypted at rest where the underlying disk supports it.
        Sealed admin secrets (SMTP password, S3 credentials) are encrypted with
        AES-256-GCM keyed off the instance&apos;s <code>APP_SECRET</code>.
        Sessions use HTTP-only Secure cookies with SameSite=Lax.
      </p>

      <h2 className="mt-6 text-lg font-semibold">Contact</h2>
      <p>
        For privacy questions or to exercise any of the rights above, contact
        the operator of this instance.
      </p>
    </>
  );
}
