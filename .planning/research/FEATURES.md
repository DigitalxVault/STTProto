# Feature Landscape: RADStrat RT Trainer

**Domain:** Military radio telephony (RT) voice procedure trainer — push-to-talk PWA
**Researched:** 2026-03-25
**Research basis:** ARSim aviation radio simulator (closest analogue), speech coach apps, push-to-talk transcription tools, NATO/ACP 125 doctrine, PWA capability surveys

---

## Table Stakes

Features users expect from a push-to-talk transcription trainer. Missing = product feels broken or unusable.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Push-to-talk button (press-and-hold) | Core interaction pattern for RT — mirrors real radio discipline | Low | Web: `pointerdown`/`pointerup` events on MediaRecorder |
| Visual mic state feedback | Users need to know if they're transmitting, processing, or idle — no feedback = confusion about whether it recorded | Low | Three states: idle (grey), recording (pulsing red), processing (spinner) |
| Accurate transcription display | If the transcript is wrong, the training loop is broken — this is the entire value proposition | Medium | Whisper API — higher accuracy than Web Speech API, handles military jargon better |
| Transcript rendered immediately on release | Any perceptible delay longer than ~2s breaks the "check myself" loop | Low-Medium | Batch on release via Whisper is acceptable; streaming not required for v1 |
| Each transmission as a distinct entry | Users review multiple transmissions in sequence — needs visual separation | Low | Timestamped lines in monospace, newest-at-top or append-at-bottom (pick one consistently) |
| Timestamp per entry | RT training is about reviewing the sequence of a net — time anchors each transmission | Low | HH:MM:SS format, local time |
| Readable transcript format | Military callsign + proword formatting must be legible — not word-wrapped soup | Low | Monospace font, sufficient contrast, no auto-punctuation interference |
| Mobile mic permission handling | Users on mobile must be guided through mic permissions — silent failure is fatal | Low | Explicit user prompt, clear error state if denied |
| Works on iOS Safari / Android Chrome | Target users are military personnel on mobile — native app install not expected | Medium | PWA with proper manifest; iOS WebKit has MediaRecorder constraints (webm vs m4a) |
| PWA installability (Add to Home Screen) | Mobile training context: users want app-like experience without App Store | Low | manifest.json + service worker + HTTPS |
| API key never exposed to client | Any public deployment must proxy the Whisper call server-side | Medium | Vercel serverless function; environment variable |
| Graceful error on transcription failure | Network failure, API timeout, or quota error must not silently swallow the recording | Low | Error state in transcript area with retry affordance |
| Clear "session" concept | Users need to know they're in a training session and what has been said so far | Low | Single-page, all transmissions visible until manual clear |

---

## Differentiators

Features that set this product apart from generic transcription tools or generic voice trainers. Not expected by first-time users, but highly valued by the target audience once present.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Military-aesthetic UI (dark, monospace, tactical) | Makes users feel they're in an RT environment — reinforces discipline and focus | Low | CSS only — black background, green/amber monospace text, no rounded-corner consumer UX |
| Proword reference panel | Trainees forget ACP 125 prowords mid-session — inline reference eliminates context switching to a manual | Low-Medium | Collapsible side panel or overlay; list of NATO prowords with meaning |
| Correct proword highlighting in transcript | Whisper returns plain text — if the app highlights correctly-used prowords (ROGER, WILCO, OUT, OVER, etc.) it gives instant positive reinforcement without scoring | Medium | Client-side regex match against known proword list; highlight vs. not-highlight, no pass/fail |
| Callsign format recognition (visual cue) | Military transmissions follow callsign structures (ALPHA CHARLIE, SHEPHERD-ACTUAL) — flagging when callsign appears helps users check their message format | Medium | Pattern matching, not validation — cosmetic differentiation only |
| Clear/Reset session button | Trainees run multiple drills — one-tap clear restores a clean sheet without page reload | Low | `window.location.reload()` or DOM clear |
| Net radio simulation framing | Framing the session as "NET" (a radio net in progress) rather than "recording" grounds the user in military context | Low | Copy/label only — no functional change |
| Offline shell / app shell caching | Field training environments have poor connectivity — app should load and allow review of existing transcript even offline; transcription obviously requires internet | Low-Medium | Service worker caches app shell; Whisper calls fail gracefully offline |
| Portrait-locked mobile layout | RT trainers are used handheld in portrait orientation — landscape switching breaks the use case | Low | CSS + manifest `orientation: portrait` |
| Long-press gesture feedback (haptic or visual) | Tactile feedback when recording starts mirrors real PTT experience on radios | Low | `navigator.vibrate()` where available; visual glow on button |
| "Transmission log" language (not "transcript") | Terminology should match RT context — "LOG" not "TRANSCRIPT", "TRANSMIT" not "RECORD" | Low | Copy/labels only |

---

## Anti-Features

Features to explicitly NOT build for v1 prototype. Common mistakes in this domain that add complexity without validating the core loop.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Automated RT scoring / grading | Requires an RT grammar model that doesn't exist off-the-shelf; would take weeks to build correctly; v1 is self-evaluation | Label the session as self-evaluation explicitly; user reads transcript, user judges |
| Real-time streaming transcription | Whisper is batch-oriented; streaming adds WebSocket complexity, server cost, latency variance; PTT is already a natural chunking mechanism | Batch on release — this is idiomatic for PTT and simpler |
| Session persistence / local storage | Adds data model, state management, and privacy surface; prototype doesn't need it | Session lives in DOM; disappears on close (this is fine and honest) |
| User accounts / auth | No multi-user need; prototype is for field-testing the core loop | No auth — just deploy and share URL |
| Multi-user / networked radio net simulation | Fundamentally different product (a networked comms simulator); enormous scope increase | Out of scope — document explicitly |
| Audio playback of recordings | Adds storage, UX complexity, and privacy concerns; users are checking transcript not audio quality | Whisper transcript is the output |
| Export / share transcript | Adds format decisions, privacy concerns, backend; not needed to validate PTT → transcript loop | Users screenshot manually if needed |
| Dark/light mode toggle | Military aesthetic is non-negotiable; dark mode is the product, not a preference | Ship dark only |
| Text-to-speech (TTS) response simulation | Would simulate an opposing callsign responding; dramatically increases scope | Out of scope for v1 |
| Filler word detection / pacing analysis | Belongs to speech coaching domain, not RT discipline domain — RT errors are proword errors and callsign errors, not "ums" | Keep to proword reference only |
| Framework (React, Vue, etc.) | No component re-use justification; vanilla JS is faster to ship and maintain for a single-page prototype | Vanilla HTML/CSS/JS as documented |

---

## Feature Dependencies

```
MediaRecorder API (mic capture)
  └── PTT button (pointerdown/pointerup)
        └── Vercel serverless proxy (API key security)
              └── Whisper API call (transcription)
                    └── Transcript display (timestamped entry)
                          └── Proword highlight (client-side, no server round-trip)
                          └── Callsign cue (client-side, no server round-trip)

PWA manifest + service worker
  └── Installability (Add to Home Screen)
  └── Offline shell (app loads without network)

Mic permission handling
  └── Error state (denied / unavailable)
  └── iOS Safari compatibility check (webm format caveat)
```

**Critical path:** PTT button → MediaRecorder → Vercel proxy → Whisper → transcript line. Everything else is enhancement.

**iOS caveat (HIGH confidence, verified via MDN/PWA surveys 2025):** iOS Safari's MediaRecorder produces `audio/mp4` (m4a), not `audio/webm`. The Whisper API accepts both, but the serverless proxy must accept `audio/mp4` MIME type or the app will silently fail on all iPhones. This is a table-stakes correctness issue that must be addressed before iOS is usable.

---

## MVP Recommendation

For the v1 prototype, prioritize:

1. PTT button with three visual states (idle / recording / processing)
2. MediaRecorder capture with iOS MIME-type handling
3. Vercel serverless proxy with Whisper API call
4. Transcript display: timestamped monospace entries, append on each release
5. Mic permission error handling with user-facing message
6. PWA manifest + minimal service worker (app shell only)
7. Military aesthetic: black background, monospace font, no consumer chrome

Defer to post-MVP (ordered by value):

- Proword highlighting: High value, low risk, but adds JS logic — do after core loop is validated
- Proword reference panel: Useful for trainees, but secondary to the transcription loop
- Clear/reset button: Needed once multi-drill sessions are tested (trivial to add)
- Haptic feedback: Enhancement only
- Offline error handling for Whisper calls: Resilience polish after core works

---

## Confidence Assessment

| Area | Confidence | Source |
|------|------------|--------|
| Table stakes (PTT, transcription, display) | HIGH | Directly specified in PROJECT.md; corroborated by ARSim feature patterns |
| PWA capabilities and iOS constraints | HIGH | MDN official docs, PWA Web Almanac 2025, multiple sources |
| Whisper API batch-on-release suitability | HIGH | OpenAI official docs confirm push-to-talk / chunked audio workflow |
| iOS MediaRecorder MIME type issue | HIGH | Multiple developer sources, confirmed PWA iOS limitations survey 2025 |
| Proword highlighting as differentiator | MEDIUM | Inferred from ARSim's "phraseology feedback" pattern; no direct military PWA comparator |
| Absence of dedicated military RT trainer apps | MEDIUM | No commercial comparable product found in search; market gap confirmed by lack of results |
| Anti-feature avoidance rationale | HIGH | Corroborated by ARSim scope analysis and PROJECT.md explicit out-of-scope decisions |

---

## Sources

- [ARSim Aviation Radio Simulator — PlaneEnglish](https://arsim.ai/) — closest analogue product (aviation RT trainer)
- [PlaneEnglish ARSim feature page](https://planeenglishsim.com/pages/arsim)
- [ACP 125 — Wikipedia](https://en.wikipedia.org/wiki/ACP_125) — NATO voice procedure standard
- [Radiotelephony procedure — Wikipedia](https://en.wikipedia.org/wiki/Radiotelephony_procedure) — proword definitions
- [OpenAI Speech to Text / Whisper API](https://developers.openai.com/api/docs/guides/speech-to-text) — batch transcription, PTT workflow
- [PWA iOS Limitations and Safari Support 2026 — MagicBell](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide) — iOS MediaRecorder constraints
- [Essential PWA Features 2025 — The Ad Firm](https://www.theadfirm.net/progressive-web-apps-in-2025-essential-features-every-website-needs/) — PWA baseline expectations
- [PWA Web Almanac 2025 — HTTP Archive](https://almanac.httparchive.org/en/2025/pwa) — PWA adoption patterns
