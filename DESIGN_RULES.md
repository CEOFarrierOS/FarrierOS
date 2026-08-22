# FarrierOS Design Rules

## Product Feel

FarrierOS should feel fast, sturdy, and practical. It is a field tool, not an office CRM.

## Visual Direction

- Dark-mode-friendly by default.
- High contrast without harsh glare.
- Large buttons and tap targets.
- Dense enough for work, never cluttered.
- Avoid corporate blue CRM styling.
- Avoid decorative dashboards.
- Use clear labels and familiar symbols.
- Prioritize horse, foot, setup, and route information.

## Interaction Rules

- Common actions should take 3 taps or fewer.
- One-handed mobile use should be possible for primary flows.
- Minimize typing.
- Prefer presets, toggles, segmented controls, and reusable values.
- Use large foot buttons for LF, RF, LH, RH.
- Keep critical actions reachable near the lower half of mobile screens where appropriate.
- Make Save and Verified states unmistakable.

## Field Usability

- Support dirty-hand and glove-friendly use with large controls.
- Do not depend on hover.
- Avoid tiny icons as the only control.
- Provide strong visual status: due, overdue, verified, prepped, complete.
- Keep text short and scannable.
- Let the user work offline without interruption.

## Layout Rules

- Mobile: bottom navigation, single-column screens, sticky primary actions when useful.
- Desktop: wider workbench layout with navigation and detail panels.
- Do not nest cards inside cards.
- Use compact panels and full-width sections.
- Text must not overflow buttons or labels.
- Four-foot controls should keep stable dimensions.

## Content Rules

- Use farrier language: foot, setup, clips, pads, wedges, borium, fit notes, verified setup.
- Avoid generic CRM terms like account pipeline, lead, opportunity, or deal.
- Use realistic sample data only.
- Make mock functions explicit: preview only, not sent.

## Accessibility Rules

- Maintain readable contrast.
- Use semantic buttons and inputs.
- Keep focus states visible.
- Do not rely on color alone for status.
- Use labels for controls.
- Support keyboard navigation on desktop.

## PWA Rules

- The app should be installable later.
- Offline-first messaging should be built into the experience.
- Local storage is acceptable for Prototype 0.
- IndexedDB is preferred for the real MVP.
