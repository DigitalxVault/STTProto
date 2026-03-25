---
phase: 01-shell-pwa
plan: "02"
subsystem: pwa
tags: [pwa, service-worker, manifest, cache-api, vercel, offline, installable]

requires:
  - phase: 01-shell-pwa plan 01
    provides: "index.html, style.css, app.js app shell that SW precaches"

provides:
  - "manifest.json: PWA manifest enabling Chrome installability checklist"
  - "sw.js: Service worker with precache install + cache-first fetch + /api/* exclusion"
  - "vercel.json: no-cache header for sw.js to prevent stale service worker bugs"
  - "icons/icon-192.png, icon-512.png, apple-touch-icon.png: placeholder solid-color valid PNGs"

affects:
  - "02-audio-capture: Phase 2 must test audio in installed PWA (iOS WebKit bug only in standalone mode)"
  - "04-integration: sw.js PRECACHE_URLS must be updated when new assets are added"

tech-stack:
  added: [Cache Storage API, Service Worker API, Web App Manifest]
  patterns:
    - "Cache-first fetch strategy for app shell assets"
    - "/api/* exclusion from service worker cache (prevents Phase 4 caching bugs)"
    - "Separate purpose entries for any vs maskable icons (not combined)"
    - "vercel.json header override for sw.js to enforce no-cache"

key-files:
  created:
    - manifest.json
    - sw.js
    - vercel.json
    - icons/icon-192.png
    - icons/icon-512.png
    - icons/apple-touch-icon.png
  modified: []

key-decisions:
  - "Icons use separate purpose entries ('any' and 'maskable') not combined 'any maskable' — web.dev recommends separate entries for Chrome installability"
  - "sw.js excludes /api/* routes from cache — Phase 4 will add a Vercel proxy at /api/transcribe; caching it would break STT responses"
  - "vercel.json sets no-cache, no-store on /sw.js — ensures updated service worker versions deploy immediately without stale cache issues"
  - "Python raw-bytes PNG generation — no PIL/Pillow dependency, produces valid PNGs that pass browser installability checks"

patterns-established:
  - "Cache versioning pattern: CACHE_NAME = 'rt-trainer-v1' — bump version string to invalidate cache on deploy"
  - "skipWaiting + clients.claim pattern for immediate SW activation without page reload"

duration: 2min
completed: "2026-03-25"
---

# Phase 01 Plan 02: PWA Infrastructure Summary

**Cache-first service worker with manifest, placeholder icons, and Vercel no-cache header enabling Chrome PWA installability and offline app shell loading**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-25T04:15:33Z
- **Completed:** 2026-03-25T04:16:42Z
- **Tasks:** 2
- **Files modified:** 6 created

## Accomplishments

- PWA manifest with standalone display, portrait orientation, and correctly structured icon entries passes Chrome DevTools installability checklist
- Service worker precaches all app shell assets on install, serves them cache-first for offline support after first visit
- Vercel config ensures sw.js is never served from edge cache, preventing stale service worker deployment issues

## Task Commits

1. **Task 1: manifest.json, vercel.json, and placeholder icons** - `dab0919` (feat)
2. **Task 2: sw.js service worker** - `df3a24c` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `manifest.json` - PWA manifest: name, display standalone, portrait, separate any/maskable icon entries
- `sw.js` - Service worker: precache on install, cache cleanup on activate, cache-first fetch excluding /api/*
- `vercel.json` - Cache-Control no-cache, no-store for /sw.js
- `icons/icon-192.png` - 192x192 valid RGB PNG (solid #1a1a1a), Android install prompt
- `icons/icon-512.png` - 512x512 valid RGB PNG (solid #1a1a1a), Android splash screen
- `icons/apple-touch-icon.png` - 180x180 valid RGB PNG (solid #1a1a1a), iOS home screen

## Decisions Made

- Separate `purpose` entries for `any` and `maskable` icons (not `"purpose": "any maskable"`) — Chrome 2023+ prefers explicit separation
- /api/* route exclusion baked into sw.js from Day 1 — prevents Phase 4 caching bugs before they occur
- vercel.json no-cache on sw.js — ensures fresh service worker on every deploy with no CDN interference
- Generated PNG icons from Python raw bytes — avoids PIL dependency, produces spec-compliant files that pass `file` command validation

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- PWA infrastructure complete; app can be installed on Android (Chrome) and iOS (Safari)
- Phase 2 (audio capture) must begin on an installed PWA to reproduce iOS WebKit audio bug #185448 in standalone mode
- sw.js PRECACHE_URLS will need updating in Phase 4 when /api/transcribe endpoint assets are added

---
*Phase: 01-shell-pwa*
*Completed: 2026-03-25*
