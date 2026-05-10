# TL Finance Core - Improvement Opportunities

## Purpose

This document records the current project review for the v0.5.0 handoff. It
separates public-readiness work from the local document archive.

## Architecture

Reviewed areas:

| Area | Status |
| --- | --- |
| Application structure | Coherent Next.js App Router structure with clear server/client split |
| Data model | Strong household boundary and additive migration history |
| Money handling | Decimal-based and suitable for finance workflows |
| Auth | Good foundation, but verification and delivery flows need hardening |
| Operations | Docker path is useful; HA stack is local-ready but not production-runbook complete |
| Documentation | Public set now structured; local archive ignored |

## Configuration

Priority scale:

| Priority | Meaning |
| --- | --- |
| P0 | Blocks safe public use |
| P1 | Should be fixed before public alpha |
| P2 | Should be addressed before beta |
| P3 | Quality or maintainability improvement |

## Deployment

Before public alpha, validate:

1. Fresh clone to first login.
2. Migration deploy on an empty database.
3. Backup creation and restore.
4. Password reset with real SMTP.
5. HA restart of one app container.
6. Payment-provider sandbox flow.

## Usage

Findings and opportunities:

| Priority | Area | Observation | Recommended work |
| --- | --- | --- | --- |
| P1 | Mail | SMTP adapter now sends reset and verification mail, with log fallback for unconfigured local instances. | Add SMTP sink integration tests and production provider runbook. |
| P1 | Email verification | Token generation, delivery, resend, and protected app/API gates are implemented. | Add browser-level signup-to-verification tests with a local SMTP sink. |
| P1 | Backups | Manual admin-triggered `pg_dump` runner is available in the production image. | Add scheduled execution, restore command, S3-compatible upload, and failure alerting. |
| P1 | User separation | Schema supports memberships, but active household selection is first-membership only. | Add active-household selection, membership management, and access tests in v0.6.0. |
| P1 | Access security | Admin pages and protected API routes are gated; CI now includes a static route-guard readiness check. | Add dynamic cross-tenant API integration tests. |
| P2 | Redis | Redis is included in multinode compose but not used for sessions or queues. | Either wire it for rate limits/jobs or remove it until the backup/payment job queue needs it. |
| P2 | Import replace | Replace import intentionally hard-deletes household data after client confirmation. | Require server-side confirmation token, recent export warning, and admin/audit escalation before SaaS use. |
| P2 | APP_SECRET rotation | Rotating the secret makes sealed admin secrets unreadable. | Add a re-seal command or UI flow that accepts old and new secrets. |
| P2 | Test coverage | Focused unit tests and public-readiness checks now exist. | Expand to forecast, ownership, import/export, and browser smoke coverage. |
| P3 | Naming | Legacy Swiss Budget Planner names existed in compose/scripts/docs. | Keep TL Finance Core naming consistent in code, docs, Docker metadata, and export filenames. |

## Troubleshooting

- If a finding seems outdated, verify it in source before deleting it.
- Do not move local-only planning back into public docs without rewriting it
  into the standard module structure.
- Treat review items as planning guidance, not as a substitute for issue-level
  acceptance criteria.
