# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-25)

**Core value:** Push-to-talk produces accurate, immediate transcription so users can see exactly what they said and self-correct their RT discipline
**Current focus:** Phase 3 — Vercel Proxy (Phase 2 complete)

## Current Position

Phase: 2 of 4 (Audio Capture) — Phase complete
Plan: 2 of 2 in current phase
Status: Phase complete — ready for Phase 3
Last activity: 2026-03-25 — Completed 02-02-PLAN.md (audio capture hardening: permission UX, blob validation, diagnostics)

Progress: [████░░░░░░] 40%

_(4 of ~10 plans complete across all phases)_

## Performance Metrics

**Velocity:**
- Total plans completed: 4
- Average duration: ~3 min
- Total execution time: ~0.2 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-shell-pwa | 2/2 done | ~12 min | ~6 min |
| 02-audio-capture | 2/2 done | ~2 min | ~1 min |

**Recent Trend:**
- Last 5 plans: ~10 min, ~2 min, ~1 min, ~1 min
- Trend: Accelerating

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
- [01-02]: Separate purpose entries for any vs maskable icons — Chrome 2023+ prefers explicit separation over combined "any maskable"
- [01-02]: sw.js excludes /api/* from cache — Phase 4 Vercel proxy at /api/transcribe must never be cached
- [01-02]: vercel.json sets no-cache, no-store on /sw.js — prevents stale service worker on Vercel edge deploys
- [01-02]: CACHE_NAME versioning pattern (rt-trainer-v1) — bump version string to invalidate cache on future deploys
- [02-01]: setState('processing') called in stopRecording() immediately; setState('idle') called inside recorder.onstop — brief PROCESSING state visible between button release and blob ready
- [02-01]: setPointerCapture called in pointerdown — required for iOS PTT reliability when finger slides off button
- [02-01]: MIME priority: audio/webm;codecs=opus > audio/webm > audio/mp4 > browser default
- [02-01]: audio-captured CustomEvent dispatched on micBtn with bubbles:true — Phase 4 can listen at document level
- [02-01]: Stream cached with liveness check (readyState === 'live') — no re-prompt on second press
- [02-02]: showStatusTemp restores previous text/color by capturing them before override — avoids hardcoding STANDBY
- [02-02]: NotAllowedError and PermissionDeniedError both map to MIC BLOCKED — covers Firefox naming difference
- [02-02]: Rapid tap guard calls setState('idle') directly rather than stopRecording() to avoid null-recorder errors
- [02-02]: Diagnostics use typeof MediaRecorder !== 'undefined' guard so script does not throw on unsupported browsers
- [02-02]: Display mode check combines matchMedia standalone and navigator.standalone for iOS/Android parity
- [02-02]: All [PTT] prefixed console logs enable easy DevTools filtering in production debugging

### Pending Todos

- Phase 2 complete. Ready to execute Phase 3 (Vercel proxy / OpenAI Whisper API integration).

### Blockers/Concerns

- [Research]: iOS 16/17 device availability for testing — silent audio bug is most severe on older iOS; need to clarify target device baseline during Phase 2 planning
- [Research]: Vercel Hobby plan timeout (10s vs 300s) — confirm in Vercel dashboard before Phase 3 deployment

## Session Continuity

Last session: 2026-03-25T05:16:04Z
Stopped at: Completed 02-02-PLAN.md — audio capture hardening with permission UX, blob validation, MIME logging, rapid tap guard, and cross-browser diagnostics in app.js.
Resume file: None
