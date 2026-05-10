export default function CookiesPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Cookie Policy</h1>
      <p className="text-sm text-muted-foreground">
        Last updated: 2026-04-29.
      </p>

      <p>
        TL Finance Core uses the smallest amount of state on your device that
        the app can&apos;t function without. There are no advertising or
        cross-site tracking cookies.
      </p>

      <h2 className="mt-6 text-lg font-semibold">Strictly necessary</h2>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Stored as</th>
            <th>Purpose</th>
            <th>Lifespan</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>tlfc_session</code>
            </td>
            <td>Cookie (HTTP-only, Secure, SameSite=Lax)</td>
            <td>Keeps you signed in to your household.</td>
            <td>Until sign-out or session expiry (default 30 days)</td>
          </tr>
          <tr>
            <td>
              <code>tlfc.theme</code>
            </td>
            <td>localStorage</td>
            <td>Remembers your light / dark / system theme choice.</td>
            <td>Until you clear browser storage</td>
          </tr>
          <tr>
            <td>
              <code>tlfc.cookieConsent.v1</code>
            </td>
            <td>localStorage</td>
            <td>Records your choice from the cookie banner.</td>
            <td>Until you clear browser storage</td>
          </tr>
        </tbody>
      </table>

      <h2 className="mt-6 text-lg font-semibold">Optional / analytics</h2>
      <p>
        None today. The cookie banner exposes an &quot;analytics&quot; toggle so
        we can introduce opt-in metrics later without surprising you. As long
        as the toggle stays off, no analytics is loaded.
      </p>

      <h2 className="mt-6 text-lg font-semibold">Third-party cookies</h2>
      <p>None. TL Finance Core does not embed third-party content that drops cookies.</p>

      <h2 className="mt-6 text-lg font-semibold">How to manage</h2>
      <p>
        You can clear the entries above at any time through your browser.
        Clearing the session cookie signs you out; clearing the theme entry
        resets to system theme.
      </p>
    </>
  );
}
