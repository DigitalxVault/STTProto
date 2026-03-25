# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-25)

**Core value:** Push-to-talk produces accurate, immediate transcription so users can see exactly what they said and self-correct their RT discipline
**Current focus:** Phase 4 — Integration (Phase 3 complete)

## Current Position

Phase: 3 of 4 (Vercel Proxy) — Phase complete
Plan: 1 of 1 in current phase
Status: Phase complete — ready for Phase 4
Last activity: 2026-03-25 — Completed 03-01-PLAN.md (Vercel proxy: POST /api/transcribe with OpenAI Whisper)

Progress: [█████░░░░░] 50%

_(5 of ~10 plans complete across all phases)_

## Performance Metrics

**Velocity:**
- Total plans completed: 5
- Average duration: ~3 min
- Total execution time: ~0.2 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-shell-pwa | 2/2 done | ~12 min | ~6 min |
| 02-audio-capture | 2/2 done | ~2 min | ~1 min |
| 03-vercel-proxy | 1/1 done | ~5 min | ~5 min |

**Recent Trend:**
- Last 5 plans: ~10 min, ~2 min, ~1 min, ~1 min, ~5 min
- Trend: Stable fast

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
- [03-01]: Web Standard POST export (not legacy req/res) — required for Vercel ESM runtime
- [03-01]: toFile(buffer, filename, {type}) used to feed ArrayBuffer into Whisper API
- [03-01]: 5 ordered guards: API key → content-type → formData parse → file field → 4MB size limit
- [03-01]: MIME-to-ext map covers webm/mp4/ogg/wav/mp3 with webm default
- [03-01]: maxDuration: 30s in vercel.json — Whisper can take 10-20s; leaves headroom
- [03-01]: No CORS headers added — Phase 4 integration is same-origin

### Pending Todos

- Phase 3 complete. Ready to execute Phase 4 (frontend integration: wire audio-captured event → /api/transcribe → display text).
- User must set OPENAI_API_KEY in .env (local) and Vercel Dashboard (production) before endpoint is usable.

### Blockers/Concerns

- [Research]: iOS 16/17 device availability for testing — silent audio bug is most severe on older iOS; need to clarify target device baseline during Phase 2 planning
- [Research]: Vercel Hobby plan timeout may cap maxDuration at 10s despite 30s config — confirm in Vercel dashboard before production deployment
- [Setup]: OPENAI_API_KEY must be configured before /api/transcribe can be tested or deployed

## Session Continuity

Last session: 2026-03-25T05:25:00Z
Stopped at: Completed 03-01-PLAN.md — Vercel proxy with POST /api/transcribe, 5-guard validation, toFile Whisper conversion, vercel.json maxDuration.
Resume file: None
