# TL Finance Core - UI Specification

## Purpose

This document defines the interface rules for TL Finance Core. The product is a
work-focused finance tool, so the interface should prioritize scanning,
comparison, predictable navigation, and low visual noise.

## Architecture

UI implementation:

| Area | Implementation |
| --- | --- |
| Theme | `src/app/globals.css`, `src/components/theme-provider.tsx` |
| Font | Inter via `next/font/google` |
| Navigation | `src/components/nav.tsx` inside `AppShell` |
| Primitives | `src/components/ui/*` |
| Charts | Recharts wrappers in `src/components/charts/dashboard-charts.tsx` |
| Icons | Lucide React |

## Configuration

TL Finance Core Style Guide v1.0:

| Rule | Value |
| --- | --- |
| Dark background | `#0B0F14` |
| Brand gradient | `#7A3CFF` to `#00D1C7` |
| Typography | Inter, clean, minimal |
| Layout | 8px grid, max width 1200px |
| Icons | Line-based, consistent stroke |
| Radius | 8px or less unless inherited from primitives |
| Tone | Technical, precise, no marketing language |

Use Tailwind theme tokens instead of hard-coded colors in components.

## Deployment

The UI ships with the Next.js app. No separate asset build is required beyond
`npm run build`.

## Usage

Design rules for new screens:

1. Build the usable workflow as the first screen.
2. Use tables and dense lists for operational data.
3. Use cards only for repeated items, panels, or bounded tools.
4. Use icon buttons for common tools when Lucide has a suitable icon.
5. Keep button text short and ensure it wraps cleanly on mobile.
6. Use `MoneyAmount` for money display.
7. Cast Prisma `Decimal` values to strings before passing data to client components.

## Troubleshooting

- If text overflows a button or card, reduce copy or adjust layout constraints.
- If a component uses a raw hex color, move it to a theme token.
- If charts fail on empty data, render an empty state rather than a blank panel.
- If a page feels like a landing page, replace it with the actual workflow.
