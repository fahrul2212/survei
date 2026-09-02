---
name: stica-portal-ui
description: "Review or change the STICA reporting portal interface while preserving its brand, reusable React/Tailwind component boundaries, responsive behavior, and accessible reporting workflows. Use for UI/UX work in this repository; do not use for database-only changes."
---

# STICA Portal UI

Keep the portal calm, operational, and easy for non-technical administrators. Preserve the STICA red, white, slate, and obsidian palette.

## Visual language

- Use opaque surfaces. Do not add glassmorphism, backdrop blur, translucent cards, glow, decorative gradients, or ambient ornaments.
- Build hierarchy with typography, spacing, alignment, borders, and restrained color. Shadows are reserved for temporary overlays such as dialogs and drawers; ordinary cards and lists should stay flat.
- Avoid hover elevation, scale, and decorative entrance animation. Hover and selected states should use predictable color or border changes.
- Prefer structured rows for operational lists. Keep year, status, title, and action in stable columns; do not center an entire data row.
- STICA red identifies the primary action, current focus, or important requirement. Do not use it as general decoration.

## Component boundaries

- Put reusable controls, page headers, empty states, search fields, and truncation behavior in `src/components`.
- Keep database access out of presentational components. Feature components may load their own data only when they own the full workflow, such as the audit log.
- Use Tailwind utilities for component-local layout and state. Keep `src/styles.css` limited to Tailwind imports, theme tokens, and base element rules; do not add component selectors or a new override stylesheet.
- Use Lucide icons. Do not use emoji or text glyphs as interface icons.

## UX invariants

- Never show a complete email address in persistent navigation. Keep it available through an accessible label or tooltip.
- Truncate company names, emails, references, slugs, event details, and other unbounded text without removing access to the full value.
- A page has one primary action. Disabled destructive or publish actions must look neutral and explain why they are disabled.
- Empty states need an icon, a short title, one useful sentence, and at most one primary action. Hide irrelevant search or filter controls when no data exists.
- Keep field labels explicit. Use icons as reinforcement, not as the only label for unfamiliar actions.
- A survey preview must exercise the same reusable input controls and conditional visibility rules as the company workflow. It should be interactive, clearly marked as unsaved, and navigable by question and section.
- Preserve native scrolling and visible keyboard focus. Respect `prefers-reduced-motion`.

## Responsive QA

Verify meaningful flows at 1600x900 desktop, 1024x768 tablet, and 390x844 mobile. At each size check horizontal overflow, long names and emails, table/card conversion, navigation height, dialogs, focus visibility, and empty/loading/error states. Use the live deployment for final review after CI/CD completes.
