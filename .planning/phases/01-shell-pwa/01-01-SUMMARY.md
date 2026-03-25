---
phase: 01-shell-pwa
plan: "01"
subsystem: ui
tags: [html, css, pwa, service-worker, military-aesthetic, dark-theme, animations]

# Dependency graph
requires: []
provides:
  - "index.html — Complete app shell with PWA head tags, transcript panel, bottom-right mic button"
  - "style.css — Military dark aesthetic, 100dvh layout, safe-area padding, all three mic button states with CSS animations"
  - "app.js — Service worker registration stub"
affects:
  - 01-shell-pwa (plan 02 — manifest, icons, installability verification)
  - 02-audio-capture (Phase 2 will add PTT behavior to existing mic button)
  - 03-vercel-proxy (no direct dependency)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CSS custom properties for all color tokens (--bg-primary, --text-primary, etc.)"
    - "100dvh min-height with env(safe-area-inset-*) for iOS notch/home-bar compatibility"
    - "Inline SVG microphone icon (no external icon library dependency)"
    - "CSS-only button state machine via class swapping (state-idle, state-recording, state-processing)"
    - "Radial-gradient for metallic button appearance without images"

key-files:
  created:
    - index.html
    - style.css
    - app.js
  modified: []

key-decisions:
  - "Mic button is bottom-RIGHT aligned (flex-end), matching user reference image — not centered"
  - "Omit apple-mobile-web-app-capable meta tag per web.dev warning that it breaks PWA behavior"
  - "Use 100dvh (not 100vh) to avoid iOS Safari viewport bar clipping content"
  - "Service worker registration is feature-detected (if 'serviceWorker' in navigator) for graceful degradation"
  - "Phase 1 demo strip included inline to verify all three button states render without JavaScript"

patterns-established:
  - "Military monospace aesthetic: Courier New stack, letter-spacing 0.05em–0.15em, phosphor green (#3a7a3a) for headers"
  - "Dark panel: bg-panel #111111, border-dim #2a2a2a, 1px solid border"
  - "Button states via class replacement: state-idle / state-recording / state-processing"
  - "pulse-red @keyframes: box-shadow glow animation for recording state"
  - "spin @keyframes: ::after pseudo-element overlay for processing state"

# Metrics
duration: 1min
completed: 2026-03-25
---

# Phase 1 Plan 01: Shell + PWA App Shell Summary

**Dark military-aesthetic HTML/CSS app shell with transcript panel, bottom-right metallic mic button, and three pure-CSS button states (idle/recording/processing) — no JS dependencies, PWA-ready head tags**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-03-25T04:13:58Z
- **Completed:** 2026-03-25T04:15:27Z
- **Tasks:** 3
- **Files created:** 3

## Accomplishments

- Complete static app shell that looks like the final application without any runtime dependencies
- All three mic button states (idle: metallic grey, recording: pulsing red, processing: spinning overlay) render as pure CSS — verified via demo strip in HTML
- iOS-safe layout using `100dvh`, `env(safe-area-inset-*)`, and `viewport-fit=cover` prevents clipping on notched devices

## Task Commits

Each task was committed atomically:

1. **Task 1: Create index.html with full structure and PWA head tags** - `8826c02` (feat)
2. **Task 2: Create style.css with military aesthetic and all mic button states** - `bf558d0` (feat)
3. **Task 3: Create app.js stub with service worker registration** - `ba4de77` (feat)

## Files Created/Modified

- `index.html` — App shell: PWA head tags (manifest, apple-touch-icon, viewport-fit, theme-color), status bar header, transcript panel, bottom-right mic button with inline SVG, Phase 1 state demo strip, deferred app.js script
- `style.css` — Military aesthetic, CSS custom properties, 100dvh layout with safe-area padding, metallic mic button, all three state animations (pulse-red, spin), demo strip sizing
- `app.js` — 8-line stub: service worker feature detection + registration of /sw.js with error catch

## Decisions Made

- **Mic button alignment:** Bottom-right (`justify-content: flex-end`) per user reference image, not centered. Centered would be incorrect.
- **No apple-mobile-web-app-capable:** Omitted per web.dev recommendation — this meta tag causes broken PWA behavior on modern iOS.
- **100dvh not 100vh:** iOS Safari's dynamic viewport bar causes 100vh to extend under the browser chrome. 100dvh accounts for this correctly.
- **Inline SVG icon:** Avoids external icon library dependency for Phase 1. Phase 2 can swap for icon font/sprite if needed.
- **Phase 1 demo strip in HTML:** Inline verification aid showing all three button states simultaneously. Enables visual QA without JavaScript. Can be removed or hidden in a later phase.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- App shell is complete and ready for Plan 02 (manifest.json, icons, PWA installability)
- Mic button DOM structure and CSS state classes are finalized — Phase 2 PTT code only needs to swap `state-idle` / `state-recording` / `state-processing` classes
- No blockers for Plan 02

---
*Phase: 01-shell-pwa*
*Completed: 2026-03-25*
