# TL Finance Core - Documentation Index

## Purpose

This folder contains the public documentation set for TL Finance Core v0.7.5.
The structure is intentionally grouped by module so the public repository does
not expose stale root-level planning material.

## Architecture

```text
docs/
  architecture/   System shape and data model
  design/         UI and brand implementation rules
  operations/     Deployment and runtime operations
  product/        End-user workflow documentation
  reference/      API, schema, and category preset reference
  release/        Public changelog
  review/         Current improvement opportunities
  strategy/       Version roadmap
  blogpost/       Ghost-ready announcement post
```

Every public Markdown document follows the same module pattern:

```text
# TL Finance Core - <Module>

## Purpose
## Architecture
## Configuration
## Deployment
## Usage
## Troubleshooting
```

## Configuration

Documentation must follow TL Finance Core Style Guide v1.0:

| Rule | Value |
| --- | --- |
| Background | Dark mode first, `#0B0F14` |
| Brand gradient | `#7A3CFF` to `#00D1C7` |
| Typography | Inter, clean, minimal |
| Layout | 8px grid, max width 1200px |
| Icons | Line-based, consistent stroke |
| Tone | Technical, precise, no marketing language |

## Deployment

Documentation is deployed as plain Markdown in the public repository. The
`old-docs/` archive and `AI_AGENT_GUIDE.md` are local-only and ignored by git.

## Usage

Use these entry points:

| Need | Document |
| --- | --- |
| Run the system | [operations/DEPLOYMENT.md](operations/DEPLOYMENT.md) |
| Deploy HA roles | [operations/HA_DEPLOYMENT.md](operations/HA_DEPLOYMENT.md) |
| Configure payment alpha | [operations/PAYMENTS_ALPHA.md](operations/PAYMENTS_ALPHA.md) |
| Prepare public deployment | [operations/PUBLIC_DEPLOYMENT_CHECKLIST.md](operations/PUBLIC_DEPLOYMENT_CHECKLIST.md) |
| Understand the stack | [architecture/ARCHITECTURE.md](architecture/ARCHITECTURE.md) |
| Understand stored data | [architecture/DATA_MODEL.md](architecture/DATA_MODEL.md) |
| Inspect API contracts | [reference/API.md](reference/API.md) |
| Inspect database details | [reference/DATABASE_SCHEMA.md](reference/DATABASE_SCHEMA.md) |
| Use the product | [product/USER_GUIDE.md](product/USER_GUIDE.md) |
| Follow UI rules | [design/UI_SPEC.md](design/UI_SPEC.md) |
| Review security audit | [review/SECURITY_AUDIT_V0_7_5.md](review/SECURITY_AUDIT_V0_7_5.md) |
| Track releases | [release/CHANGELOG.md](release/CHANGELOG.md) |
| Plan next work | [strategy/ROADMAP.md](strategy/ROADMAP.md) |

## Troubleshooting

- If a document does not fit the module structure, move it to `old-docs/`
  until it is rewritten.
- Do not add project planning drafts to the repo root.
- Do not publish AI-agent local operating notes.
