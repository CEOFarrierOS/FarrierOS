# FarrierOS Base Configuration

Saved: 2026-07-06

## Baseline Name

Prototype 0 - Field Layout Baseline

## What This Baseline Includes

- React, TypeScript, and Vite local-first PWA prototype.
- Local storage persistence with realistic sample data.
- Core sections: Today, Calendar, Clients and Barns, Horses, Prep Tomorrow, Finish Job.
- Field-oriented dark UI with large controls and responsive layouts.
- Calendar day, week, and monthly views.
- Shared-board mock collaboration with automatic local system pings.
- Cleaned layout orientation for text, stop cards, buttons, and schedule panels.
- Fluffy demo workflow from Today through RF foot history, Prep Tomorrow, Finish Job, and Save Verified Setup.

## Current Product Direction

This is the base version to preserve before further feature work. The app should continue to feel like a tough field tool for working farriers, with the differentiator centered on verified shoeing setup history and tomorrow's prep.

## Prototype Boundaries

- No real cloud sync.
- No real SMS.
- No real push notifications.
- No real payments.
- No real client data.
- No account system.

## How To Run

```powershell
cd C:\Users\Josha\Documents\Codex\2026-07-06\you-are-my-senior-product-engineer-2
$env:PATH='C:\Users\Josha\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;C:\Users\Josha\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin;' + $env:PATH
pnpm run dev
```

Then open:

```text
http://127.0.0.1:5173/
```
