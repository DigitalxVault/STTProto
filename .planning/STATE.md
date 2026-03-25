# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-25)

**Core value:** Push-to-talk produces accurate, immediate transcription so users can see exactly what they said and self-correct their RT discipline
**Current focus:** Phase 1 — Shell + PWA

## Current Position

Phase: 1 of 4 (Shell + PWA)
Plan: 1 of 2 in current phase
Status: In progress
Last activity: 2026-03-25 — Completed 01-01-PLAN.md (App Shell: index.html, style.css, app.js)

Progress: [█░░░░░░░░░] 10%

_(1 of ~10 plans complete across all phases)_

## Performance Metrics

**Velocity:**
- Total plans completed: 1
- Average duration: 1 min
- Total execution time: 0.02 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-shell-pwa | 1/2 done | 1 min | 1 min |

**Recent Trend:**
- Last 5 plans: 1 min
- Trend: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Phases 2 and 3 are independently buildable in parallel — audio capture and Vercel proxy can be built simultaneously before Phase 4 integration
- [Roadmap]: Phase 1 must produce an installable PWA before Phase 2 starts — iOS standalone-mode audio bug (WebKit #185448) is only reproducible in installed PWA mode, so installability must be confirmed first
- [01-01]: Mic button is bottom-right aligned (flex-end) per user reference image — not centered
- [01-01]: Omit apple-mobile-web-app-capable meta tag per web.dev — breaks PWA behavior on modern iOS
- [01-01]: Use 100dvh (not 100vh) to handle iOS Safari dynamic viewport bar clipping
- [01-01]: Button state machine: swap state-idle / state-recording / state-processing classes on .mic-btn
- [01-01]: Phase 1 demo strip included in HTML to verify all three states render without JS

### Pending Todos

- Plan 02 (manifest.json, icons, installability) is ready to execute

### Blockers/Concerns

- [Research]: iOS 16/17 device availability for testing — silent audio bug is most severe on older iOS; need to clarify target device baseline during Phase 2 planning
- [Research]: Vercel Hobby plan timeout (10s vs 300s) — confirm in Vercel dashboard before Phase 3 deployment

## Session Continuity

Last session: 2026-03-25T04:15:27Z
Stopped at: Completed 01-01-PLAN.md — App shell (index.html, style.css, app.js) committed
Resume file: None
