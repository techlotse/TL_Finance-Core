# TL Finance Core - Security Audit v0.7.5

## Purpose

This document records the v0.7.5 security audit scope, fixes, and remaining
risks before public alpha.

## Architecture

Reviewed surfaces:

| Surface | Outcome |
| --- | --- |
| Auth links | Password-reset and verification links now use `APP_BASE_URL` instead of trusting request host headers |
| Browser mutations | Middleware rejects unsafe cross-origin browser requests when `Origin` is present |
| Token logging | Production mail fallback and auth-route warnings omit bearer links |
| Redirects | Sign-in `next` is sanitized to local paths only |
| Payments | Hosted checkout and billing portal URLs are restricted to Stripe hosted domains |
| Imports | Destructive replace import requires server-side typed confirmation |
| First admin | First-user admin assignment runs in a serializable transaction |
| CI | `npm run test:security` enforces the audit invariants above |

## Configuration

Production operators must set:

| Variable | Security role |
| --- | --- |
| `APP_SECRET` | Seals admin secrets and signs opaque session material |
| `APP_BASE_URL` | Trusted public origin for auth links and unsafe request checks |
| `DATABASE_URL` | Writable PostgreSQL primary, never default `budget:budget` |

## Deployment

Required release checks:

```bash
npm run test:security
npm run test:migrations
npm run ci
```

The production Docker entrypoint refuses to start without a valid
`APP_BASE_URL`.

## Usage

Audit notes:

- SameSite=Lax remains on session cookies; the middleware origin check is a
  second browser-side barrier for unsafe methods.
- `Origin`-less non-browser requests are allowed so CLI operations and health
  checks keep working.
- Hosted payment links remain an alpha bridge. v0.8 webhook fulfillment must
  verify provider signatures and be idempotent.
- Replace import remains available for restore workflows, but API callers must
  provide the typed confirmation phrase.

## Troubleshooting

- If production auth emails point to the wrong host, fix `APP_BASE_URL`; do not
  rely on proxy host forwarding.
- If browser mutations return `403 Cross-origin request blocked`, confirm the
  public site origin exactly matches `APP_BASE_URL`.
- If Stripe checkout rejects a URL, use the hosted `https://buy.stripe.com/...`
  payment link for the alpha workflow.
