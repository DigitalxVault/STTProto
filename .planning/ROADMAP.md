# Roadmap: RADStrat RT Trainer

## Overview

Four phases deliver a working push-to-talk transcription PWA for military RT practice. Phase 1 builds the installable shell and visual foundation. Phases 2 and 3 build independently in parallel — audio capture and Vercel proxy — before being wired together in Phase 4 to complete the core transcription loop.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Shell + PWA** - Installable military-aesthetic app shell with all visual states
- [ ] **Phase 2: Audio Capture** - Push-to-talk recording with confirmed blob production on iOS and Android
- [ ] **Phase 3: Vercel Proxy** - Serverless function that proxies audio to Whisper and returns transcript text
- [ ] **Phase 4: Pipeline Integration** - Wire audio → proxy → transcript into working end-to-end PTT loop

## Phase Details

### Phase 1: Shell + PWA
**Goal**: Users can install the app and see the full military-aesthetic UI with all visual states represented
**Depends on**: Nothing (first phase)
**Requirements**: UI-01, UI-02, UI-03, UI-04, PWA-01, PWA-02
**Success Criteria** (what must be TRUE):
  1. App passes Chrome DevTools PWA installability checklist and can be added to home screen on Android and iOS
  2. Service worker registers and app shell loads from cache when offline
  3. Screen shows dark military aesthetic with mic button in bottom-right and transcript panel above
  4. Mic button visually cycles through idle (grey), recording (pulsing red), and processing (spinner) states
  5. Layout is portrait-oriented and usable on an iPhone-sized screen without horizontal scroll
**Plans**: 2 plans

Plans:
- [x] 01-01-PLAN.md — HTML/CSS shell with military aesthetic, bottom-right mic button, and all visual button states
- [x] 01-02-PLAN.md — manifest.json, service worker, icons, vercel.json for PWA installability and offline caching

### Phase 2: Audio Capture
**Goal**: Users can press-and-hold the mic button to capture audio that produces a valid, non-empty blob on both Android Chrome and iOS Safari
**Depends on**: Phase 1
**Requirements**: AUD-01, AUD-02, AUD-03
**Success Criteria** (what must be TRUE):
  1. Press-and-hold mic button starts recording; releasing stops it and produces a blob
  2. Mic button state changes correctly: idle on load, pulsing red while recording, returns to idle on release
  3. Captured blob has size > 0 bytes and a valid MIME type (webm/opus or mp4 depending on browser)
  4. Audio capture works in both browser tab and installed PWA standalone mode on iOS Safari
**Plans**: 2 plans

Plans:
- [ ] 02-01-PLAN.md — PTT gesture handling (pointerdown/pointerup/pointercancel) and MediaRecorder lifecycle with blob assembly
- [ ] 02-02-PLAN.md — Error handling, permission UX, blob validation, MIME logging, and cross-browser diagnostics

### Phase 3: Vercel Proxy
**Goal**: A deployed serverless function accepts an audio blob, forwards it to OpenAI Whisper, and returns transcript text without exposing the API key to the client
**Depends on**: Phase 1
**Requirements**: STT-02, STT-04
**Success Criteria** (what must be TRUE):
  1. POST to /api/transcribe with a real audio file returns { text: "..." } within 30 seconds
  2. OPENAI_API_KEY exists only in Vercel environment variables and never appears in client-side code
  3. Endpoint is verifiable independently via curl or Postman before any frontend integration
**Plans**: TBD

Plans:
- [ ] 03-01: api/transcribe.js serverless function with FormData parsing, Whisper call, and JSON response

### Phase 4: Pipeline Integration
**Goal**: Users can press-and-hold to speak, release, and immediately see their words appear as a new line in the transcript panel
**Depends on**: Phase 2 and Phase 3
**Requirements**: STT-01, STT-03
**Success Criteria** (what must be TRUE):
  1. Releasing the mic button sends the audio blob to /api/transcribe and displays the spinner during processing
  2. Transcript text appears on screen as a new line within a perceptible delay after release
  3. Each transmission appears as a separate entry in the transcript panel above the mic button
  4. Transcription failure shows a visible error state rather than silently swallowing the recording
**Plans**: TBD

Plans:
- [ ] 04-01: API client (api.js), transcript renderer (transcript.js), and app.js state machine wiring PTT through the full pipeline

## Progress

**Execution Order:**
Phases 2 and 3 are independently buildable in parallel. All other phases are strictly sequential: 1 → (2 parallel 3) → 4.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Shell + PWA | 2/2 | Complete | 2026-03-25 |
| 2. Audio Capture | 0/2 | Not started | - |
| 3. Vercel Proxy | 0/1 | Not started | - |
| 4. Pipeline Integration | 0/1 | Not started | - |
