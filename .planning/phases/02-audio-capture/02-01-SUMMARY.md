---
phase: 02-audio-capture
plan: 01
subsystem: audio
tags: [mediarecorder, getusermedia, pointer-events, ptt, webm, opus, audio-capture]

# Dependency graph
requires:
  - phase: 01-shell-pwa
    provides: mic button DOM (.mic-btn), button state CSS classes (state-idle/state-recording/state-processing), service worker registration
provides:
  - PTT gesture handling via Pointer Events API with pointer capture
  - MediaRecorder lifecycle: start on pointerdown, stop on pointerup, blob on onstop
  - getUserMedia stream acquisition with caching
  - audio-captured CustomEvent dispatched on release with blob detail
  - setState() utility updating button class and status-indicator text
affects: [03-vercel-proxy, 04-integration]

# Tech tracking
tech-stack:
  added: [MediaRecorder API, getUserMedia API, Pointer Events API, CustomEvent]
  patterns: [push-to-talk gesture with pointer capture, stream caching, MIME type priority detection, state machine via CSS classes]

key-files:
  created: []
  modified: [app.js, index.html]

key-decisions:
  - "setState() transitions: pointerdown -> recording, recorder.stop() -> processing, onstop -> idle (processing shown between stop call and onstop firing)"
  - "Pointer capture via setPointerCapture prevents missed pointerup when finger drifts off button on mobile"
  - "MIME priority: audio/webm;codecs=opus > audio/webm > audio/mp4 > browser default (empty string)"
  - "Stream caching: track liveness via readyState === 'live' before reusing, re-acquire if stale"
  - "Empty blob guard: log warning and return to idle without dispatching audio-captured event"
  - "audio-captured dispatched on micBtn with bubbles:true so Phase 4 can listen at any ancestor"

patterns-established:
  - "PTT pattern: pointerdown starts async acquisition + recording, pointerup/cancel stops"
  - "State machine: setState(state) is single source of truth for UI state, called from lifecycle callbacks not event handlers"
  - "MediaRecorder no-timeslice start: data arrives entirely in onstop, no streaming chunks needed for Phase 2"

# Metrics
duration: 1min
completed: 2026-03-25
---

# Phase 2 Plan 01: Audio Capture Summary

**Push-to-talk audio capture using Pointer Events + MediaRecorder API with stream caching, MIME detection, and audio-captured CustomEvent dispatch**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-03-25T05:12:22Z
- **Completed:** 2026-03-25T05:13:22Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Removed Phase 1 demo strip from index.html, leaving only the real mic button
- Implemented full PTT gesture lifecycle: pointerdown acquires mic + starts recorder, pointerup stops recorder
- Implemented setPointerCapture to prevent missed pointerup on mobile touch drift
- MediaRecorder with MIME priority detection produces audio blob dispatched as audio-captured CustomEvent

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove Phase 1 demo strip from HTML** - `8772fb9` (chore)
2. **Task 2: Implement PTT gesture + MediaRecorder lifecycle** - `40be6d6` (feat)

**Plan metadata:** (pending docs commit)

## Files Created/Modified
- `/app.js` - Full PTT implementation: setState, acquireMic, startRecording, stopRecording, Pointer Events handlers
- `/index.html` - Removed state-demo block (38 lines); only real .mic-btn remains

## Decisions Made
- `setState('processing')` is called in `stopRecording()` immediately when recorder.stop() is called, and `setState('idle')` is called inside `recorder.onstop` after the blob is built. This ensures users see a brief PROCESSING state between releasing the button and the blob being ready.
- `setPointerCapture` called in pointerdown handler — required for iOS PTT reliability when finger slides off button
- MIME type detection at recording time (not module init) to avoid MediaRecorder constructor errors on browsers that don't support specific types
- `audio-captured` CustomEvent dispatched on `micBtn` with `bubbles: true` so Phase 4 integration can attach listener at document level

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `audio-captured` CustomEvent is the integration point for Phase 4 — attach listener at document level and read `e.detail.blob`
- Phase 3 (Vercel proxy) and Phase 4 (integration) can proceed independently
- No known blockers for next plan (02-02)

---
*Phase: 02-audio-capture*
*Completed: 2026-03-25*
