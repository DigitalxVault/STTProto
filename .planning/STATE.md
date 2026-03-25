# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-25)

**Core value:** Push-to-talk produces accurate, immediate transcription so users can see exactly what they said and self-correct their RT discipline
**Current focus:** Phase 4.1 — Real-time Transcription + Layout Fix (INSERTED)

## Current Position

Phase: 4.1 of 4.1 (Real-time Transcription + Layout Fix)
Plan: 2 of 2 in current phase
Status: Phase complete — All plans done
Last activity: 2026-03-25 — Completed 04.1-02-PLAN.md (Realtime WebSocket transcription: replaced batch Whisper with OpenAI Realtime API streaming)

Progress: [██████████] 100%

_(8 of 8 plans complete across all phases — Phase 4.1 fully done)_

## Performance Metrics

**Velocity:**
- Total plans completed: 7
- Average duration: ~2.5 min
- Total execution time: ~0.32 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-shell-pwa | 2/2 done | ~12 min | ~6 min |
| 02-audio-capture | 2/2 done | ~2 min | ~1 min |
| 03-vercel-proxy | 1/1 done | ~5 min | ~5 min |
| 04-pipeline-integration | 1/1 done | ~3 min | ~3 min |
| 04.1-realtime-transcription-layout | 2/2 done | ~3 min | ~1.5 min |

**Recent Trend:**
- Last 7 plans: ~10 min, ~2 min, ~1 min, ~1 min, ~5 min, ~3 min, ~1 min
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
- [04-01]: setState('idle') removed from recorder.onstop after CustomEvent dispatch — idle ownership transferred to transcribeAndDisplay so PROCESSING spinner persists through full API round-trip
- [04-01]: Content-Type header omitted from fetch — browser sets correct multipart/form-data boundary automatically
- [04-01]: textContent-only DOM writes in transcript panel to prevent XSS
- [04-01]: addTranscriptError calls showStatusTemp for status bar flash in addition to transcript panel entry
- [04-01]: [STT] prefix used for pipeline integration logs, [PTT] prefix for audio capture logs
- [04.1-01]: Single .bottom-bar fixed wrapper consolidates safe-area handling and positions transcript-panel left, mic-container right
- [04.1-01]: flex-direction: column-reverse on transcript-panel — new entries grow upward with zero JS scroll management
- [04.1-01]: pointer-events: none on bottom-bar, auto on children — prevents fixed layer blocking taps on page content
- [04.1-01]: .state-demo CSS removed — Phase 1 verification strip no longer needed in production
- [04.1-01]: transcript-panel background transparent, text-shadow on entries for legibility on dark background
- [04.1-02]: acquireMic uses { channelCount: 1 } only — no echoCancellation/noiseSuppression/autoGainControl for Realtime API VAD
- [04.1-02]: WebSocket subprotocol auth: openai-insecure-api-key.{ephemeral_token}
- [04.1-02]: 1500ms grace window after input_audio_buffer.commit before ws.close() — allows final completed event
- [04.1-02]: Silent gain node (gain=0) routes workletNode to destination — required for AudioWorklet to process without mic playback
- [04.1-02]: scrollTop removed from transcript helpers — column-reverse handles upward growth

### Roadmap Evolution

- Phase 04.1 inserted after Phase 4: Real-time Transcription + Layout Fix (URGENT) — User requires streaming transcription via OpenAI Realtime API (not batch Whisper), and transcript anchored to bottom-left next to mic button

### Pending Todos

None — all planned phases complete.

### Blockers/Concerns

- [Setup]: OPENAI_API_KEY must be configured in .env (local) and Vercel Dashboard (production) before /api/transcribe returns real transcriptions
- [Research]: Vercel Hobby plan timeout may cap maxDuration at 10s despite 30s config — confirm in Vercel dashboard before production deployment

## Session Continuity

Last session: 2026-03-25T09:09:16Z
Stopped at: Completed 04.1-02-PLAN.md — Realtime WebSocket transcription replacing batch Whisper. All phases complete.
Resume file: None
