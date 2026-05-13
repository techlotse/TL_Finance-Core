# TL Finance Core - Roadmap

## Purpose

This document defines the planned path from v0.5.0 to v1.0.0.

## Architecture

The v1.0.0 target keeps the feature set close to v0.5.0 and focuses on
identity, access control, deployment hardening, payment readiness, and beta
quality.

## Configuration

Release plan:

| Version | Scope |
| --- | --- |
| v0.5.0 | Current public handoff baseline |
| v0.6.0 | User separation, active-household selection, and access tests |
| v0.7.0 | Authentication, reset/verification, rate-limit, admin, and access security hardening |
| v0.8.0 | Public alpha, HA deployment, payment provider for SaaS version |
| v0.9.0 | Bug fixes and public beta readiness |
| v1.0.0 | Stable public release with the v0.5.0 feature set preserved |
| v2.0.0 | Move identity to separate IDP |

## Deployment

Public alpha should deploy HA with explicit operational runbooks, backup
restore validation, health monitoring, and payment-provider sandbox testing.

## Usage

Planning gates:

| Gate | Required outcome |
| --- | --- |
| v0.6.0 | A user cannot access another user's household data and can intentionally choose an active household where supported |
| v0.7.0 | Auth, sessions, verification, rate limits, reset flows, and admin access are security-reviewed |
| v0.8.0 | Public alpha can accept payments and survive single app-node failure |
| v0.9.0 | Known alpha defects are fixed and beta onboarding is documented |
| v1.0.0 | Docs, deploy path, backup/restore, and access model are stable |

## Troubleshooting

- Do not expand the product surface before v1.0.0 unless the change directly
  supports authentication, security, deployment, payment, or beta readiness.
- Treat SMTP integration tests, scheduled backup execution, restore validation,
  and APP_SECRET rotation as release blockers before public SaaS use.
