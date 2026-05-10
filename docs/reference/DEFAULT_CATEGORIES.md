# TL Finance Core - Default Categories

## Purpose

This document describes the category presets available during onboarding.
Presets give a household usable groups and categories without forcing a fixed
financial model.

## Architecture

Preset source: `src/lib/category-presets.ts`.

Supported preset keys:

| Preset | Current behavior |
| --- | --- |
| `swiss` | Swiss-oriented English preset with local finance terms |
| `generic` | General English household preset |
| `german` | Falls back to generic in v0.5.0 |
| `french` | Falls back to generic in v0.5.0 |

Categories are created under household-scoped category groups. Users can rename
or remove them later.

## Configuration

The onboarding wizard sends the selected preset to `POST /api/onboarding`.
Default base currency is CHF, but the household can choose any supported ISO
currency before the preset is applied.

## Deployment

No database seed is required for a normal user. Presets are applied during
household onboarding. The optional Prisma seed creates a demo admin household
for local testing.

## Usage

The Swiss preset includes groups such as income, housing, insurance, transport,
food and household, healthcare, savings and investments, tax, and lifestyle.
It includes terms such as Pillar 3a, Quellensteuer, Serafe, Vignette, and
Nebenkosten.

Use generic when the instance should avoid country-specific labels.

## Troubleshooting

- If a preset creates unexpected labels, edit them in Settings after onboarding.
- If localization is required, implement the localized preset directly in
  `src/lib/category-presets.ts` instead of translating labels at render time.
