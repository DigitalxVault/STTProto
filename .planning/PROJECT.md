# RADStrat RT Trainer

## What This Is

A prototype PWA for practicing military radio telephony (RT) voice procedure. Users press-and-hold a mic button to transmit, their speech is transcribed via OpenAI Whisper API, and the transcript appears on screen for self-evaluation against NATO/Allied voice procedure standards.

## Core Value

Push-to-talk produces accurate, immediate transcription so users can see exactly what they said and self-correct their RT discipline.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Push-to-talk mic button (press-and-hold to record, release to stop)
- [ ] Visual mic state feedback (idle/grey, recording/pulsing red, processing/spinner)
- [ ] Audio capture via MediaRecorder API (webm/opus format)
- [ ] Server-side Whisper API proxy (Vercel serverless function)
- [ ] Transcript display in military-style monospace font
- [ ] Each transmission as new timestamped line entry
- [ ] Dark/black military aesthetic single-screen UI
- [ ] Mobile-first responsive layout (portrait, iPhone-sized)
- [ ] PWA installability (manifest.json + service worker)
- [ ] Basic offline shell via service worker
- [ ] OpenAI API key secured server-side via Vercel env vars

### Out of Scope

- Automated scoring/grading of RT procedure correctness — v1 is self-evaluation only
- Session persistence or export — transcripts live only during active session
- Multi-user or networked training — single user, single device
- OAuth or user accounts — no auth needed for prototype
- Real-time streaming transcription — batch on release is sufficient
- Custom RT protocol support — NATO/Allied (ACP 125) only

## Context

- Target users: Military personnel and trainees practicing NATO voice procedure (prowords like ROGER, WILCO, OUT, callsign formats)
- Expected transcript format: "SHEPHERD, SPARTAN, Roger, proceeding to enter OSCAR 5"
- Deployment target: Vercel (serverless functions for API proxy)
- Audio format: webm/opus from browser MediaRecorder → sent to Whisper API
- No backend/database — stateless prototype

## Constraints

- **Tech stack**: Vanilla HTML/CSS/JS — no frameworks, single-page app
- **API**: OpenAI Whisper API (whisper-1 model) — no alternatives
- **Security**: API key must never reach the client — Vercel serverless proxy required
- **Platform**: PWA, mobile-first portrait orientation
- **Deployment**: Vercel hosting with serverless functions

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Vanilla JS over framework | Prototype simplicity, minimal build tooling | — Pending |
| Vercel serverless proxy | API key security for public deployment | — Pending |
| Batch transcription (not streaming) | Simpler implementation, Whisper API is batch-oriented | — Pending |
| No scoring in v1 | Focus on core transcription loop first | — Pending |

---
*Last updated: 2026-03-25 after initialization*
