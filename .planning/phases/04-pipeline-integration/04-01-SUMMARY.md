---
phase: 04-pipeline-integration
plan: 01
subsystem: ui
tags: [fetch, formdata, whisper, transcript, customevent, mediarcorder, javascript, css]

# Dependency graph
requires:
  - phase: 02-audio-capture
    provides: audio-captured CustomEvent dispatched on micBtn with bubbles:true, Blob in event.detail
  - phase: 03-vercel-proxy
    provides: POST /api/transcribe endpoint accepting multipart FormData, returns { text } JSON

provides:
  - End-to-end PTT transcription loop: mic press → audio blob → /api/transcribe → text in transcript panel
  - transcribeAndDisplay(blob) — async fetch wrapper with network/API error handling
  - addTranscriptEntry(text) — safe DOM append with placeholder removal
  - addTranscriptError(label) — error display with status bar flash
  - document-level audio-captured listener connecting all phases
  - .transcript-entry and .transcript-error CSS classes

affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - document-level CustomEvent listener for cross-module coupling (audio capture → pipeline)
    - FormData multipart upload without manual Content-Type header
    - textContent-only DOM writes to prevent XSS
    - idle state ownership transfer to pipeline listener (not recorder.onstop)

key-files:
  created: []
  modified:
    - app.js
    - style.css

key-decisions:
  - "setState('idle') removed from recorder.onstop after CustomEvent dispatch — idle is now owned by transcribeAndDisplay to prevent flicker between PROCESSING and IDLE before fetch completes"
  - "blob.type.includes('mp4') used to determine file extension for FormData filename — matches MIME priority from Phase 2"
  - "Content-Type header omitted from fetch — browser sets correct multipart boundary automatically"
  - "textContent used exclusively (never innerHTML) in addTranscriptEntry and addTranscriptError to prevent XSS"
  - "addTranscriptError also calls showStatusTemp for status bar visibility in addition to transcript panel entry"

patterns-established:
  - "Pipeline integration section: new code goes in // -- Pipeline Integration block before // ── Diagnostics"
  - "All STT console logs use [STT] prefix; all PTT logs use [PTT] prefix for DevTools filtering"

# Metrics
duration: 3min
completed: 2026-03-25
---

# Phase 4 Plan 01: Pipeline Integration Summary

**End-to-end PTT transcription loop: audio-captured CustomEvent → fetch POST /api/transcribe → Whisper text displayed as new transcript entry, with network/API error handling and processing spinner held until API responds**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-25T05:35:50Z
- **Completed:** 2026-03-25T05:38:50Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Wired document-level audio-captured listener to transcribeAndDisplay(), completing the full PTT → transcription loop
- Removed premature setState('idle') from recorder.onstop so the processing spinner stays visible during the entire API round-trip
- Added safe DOM manipulation (textContent only) for transcript entries and errors with placeholder auto-removal
- Added network error and API error paths with status bar flash via showStatusTemp

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire audio-captured event to /api/transcribe and transcript panel** - `a3bb0d7` (feat)
2. **Task 2: Add transcript entry and error CSS styles** - `6b2cd29` (feat)

**Plan metadata:** (see final docs commit)

## Files Created/Modified
- `app.js` - Added transcriptPanel DOM ref, pipeline integration functions, audio-captured listener, removed premature idle transition
- `style.css` - Added .transcript-entry and .transcript-error styles using existing CSS custom properties

## Decisions Made
- Removed setState('idle') from recorder.onstop after CustomEvent dispatch — idle ownership transferred to transcribeAndDisplay so PROCESSING spinner persists through the full API round-trip
- Content-Type header intentionally omitted from fetch call — browser sets correct multipart/form-data boundary automatically; setting it manually would break the request
- textContent-only DOM writes to guard against XSS if API response ever contains unexpected HTML characters
- addTranscriptError writes to both the transcript panel and the status bar (showStatusTemp) for maximum visibility of failures

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required for the frontend integration itself.

**Note:** OPENAI_API_KEY must be configured in .env (local dev) and Vercel Dashboard (production) before /api/transcribe will return real transcriptions. See Phase 3 documentation.

## Next Phase Readiness

This is the final plan of the project. The full PTT transcription prototype is complete:

- Phase 1: PWA shell with mic button state machine
- Phase 2: Audio capture with push-to-talk pointer events and audio-captured CustomEvent
- Phase 3: Vercel serverless proxy to OpenAI Whisper at POST /api/transcribe
- Phase 4: Frontend pipeline integration — audio-captured → fetch → transcript panel display

**To deploy and test:**
1. Set OPENAI_API_KEY in Vercel Dashboard environment variables
2. Deploy to Vercel (`vercel --prod` or push to linked Git repo)
3. Install as PWA on iOS/Android and test push-to-talk transcription

---
*Phase: 04-pipeline-integration*
*Completed: 2026-03-25*
