---
phase: 02-audio-capture
plan: "02"
subsystem: audio
tags: [mediarecorder, pwa, ios, safari, ptt, error-handling, diagnostics]

# Dependency graph
requires:
  - phase: 02-01
    provides: PTT gesture handling, MediaRecorder lifecycle, detectMimeType, audio-captured event dispatch

provides:
  - Permission denial UX with timed status indicator (MIC BLOCKED / MIC ERROR)
  - Stream health check via getAudioTracks + readyState === live before re-prompt
  - MediaRecorder onerror handler and recorder.start() wrapped in try/catch
  - Blob validation with [PTT] Blob ready log (size, type, chunks count)
  - MIME type selection logged on every recording start
  - Rapid tap guard preventing errors when pointerup fires without active recording
  - Cross-browser + PWA standalone diagnostics block on page load

affects: [03-vercel-proxy, 04-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "showStatusTemp(): temporary status indicator override with auto-revert after timeout"
    - "Rapid tap guard: check recorder state before stopping to prevent null-recorder errors"
    - "Diagnostic block at end of script: environment capability snapshot on load"

key-files:
  created: []
  modified:
    - app.js

key-decisions:
  - "showStatusTemp restores previous text/color by capturing them before override — avoids hardcoding STANDBY"
  - "NotAllowedError and PermissionDeniedError both map to MIC BLOCKED — covers Firefox naming difference"
  - "Rapid tap guard calls setState('idle') directly rather than stopRecording() to avoid double-transition"
  - "Diagnostics use typeof MediaRecorder !== 'undefined' guard so script does not throw on unsupported browsers"
  - "Display mode check uses both matchMedia standalone and navigator.standalone for cross-browser iOS/Android parity"

patterns-established:
  - "Permission error feedback: catch block categorizes error name and calls showStatusTemp with red color"
  - "All [PTT] prefixed console logs for easy DevTools filtering"

# Metrics
duration: 1min
completed: 2026-03-25
---

# Phase 02 Plan 02: Audio Capture Hardening Summary

**Permission denial UX (MIC BLOCKED/MIC ERROR), blob validation with [PTT] console logging, rapid tap guard, and cross-browser diagnostic block added to app.js**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-03-25T05:15:12Z
- **Completed:** 2026-03-25T05:16:04Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Permission denial shows visible red "MIC BLOCKED" or "MIC ERROR" status for 3 seconds, then reverts — user knows exactly why PTT failed
- Blob validation now logs size/type/chunks on every recording stop; empty blobs warn and discard cleanly
- Rapid tap (pointerdown + immediate pointerup before recorder is active) no longer throws — guard returns idle state safely
- Page load diagnostics confirm MediaRecorder support, PointerEvent support, display mode, and MIME matrix in one console block

## Task Commits

Each task was committed atomically:

1. **Task 1: Error handling, permission UX, and blob validation** - `f40e557` (feat)
2. **Task 2: Cross-browser and PWA standalone diagnostics** - `44ef5aa` (feat)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified

- `app.js` - showStatusTemp helper, acquireMic stream health + permission error UX, startRecording MIME log + onerror + try/catch, onstop [PTT] Blob ready log, handlePressEnd rapid tap guard, diagnostics block

## Decisions Made

- `showStatusTemp` captures prevText/prevColor before overriding so it restores the exact prior state rather than hardcoding "STANDBY" — works in any state machine state
- `NotAllowedError` and `PermissionDeniedError` both map to "MIC BLOCKED" — Firefox uses the non-standard name
- Rapid tap guard calls `setState('idle')` directly rather than `stopRecording()` to avoid triggering the recorder.stop() path on a null recorder
- Diagnostics use `typeof MediaRecorder !== 'undefined'` guard to prevent script throw on unsupported browsers before any feature call
- Display mode detection combines `matchMedia('(display-mode: standalone)')` and `window.navigator.standalone` for iOS/Android parity

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 2 complete. Both plans executed: PTT lifecycle (02-01) and hardening/diagnostics (02-02).
- app.js now has full audio capture pipeline with error handling, blob validation, and diagnostics.
- Phase 3 (Vercel proxy) and Phase 4 (integration) can proceed. Phase 4 listens for `audio-captured` CustomEvent at document level.
- Remaining concern: iOS 16/17 device testing for silent audio bug — needs physical device or BrowserStack to verify standalone mode behavior.

---
*Phase: 02-audio-capture*
*Completed: 2026-03-25*
