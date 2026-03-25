# Project Research Summary

**Project:** RADStrat RT Trainer
**Domain:** Military radio telephony (RT) push-to-talk voice trainer — vanilla JS PWA
**Researched:** 2026-03-25
**Confidence:** HIGH — all major claims verified against MDN, official Vercel docs, or OpenAI official sources.

---

## Executive Summary

RADStrat RT Trainer is a single-purpose, single-screen Progressive Web App that lets military personnel practice radio telephony (RT) voice procedure by speaking into a push-to-talk button and immediately seeing their transmission transcribed. The product is closer to a drill tool than a coaching app — the core value loop is: press, speak, release, read the transcript, self-evaluate. There is no comparable dedicated military RT PWA in the market; the closest analogue is PlaneEnglish ARSim (aviation-focused). This simplicity of the interaction model is the design's greatest asset and should be protected against scope creep throughout development.

The recommended technical approach is a four-component vanilla JS pipeline — no framework, no build step — deployed to Vercel as a static site with a single serverless function that proxies the OpenAI Whisper API. This is the minimum viable architecture that achieves the goal, protects the API key, works on mobile browsers, and ships as an installable PWA. Using Whisper (model `whisper-1`) over the browser's Web Speech API is non-negotiable: Web Speech API lacks the accuracy for military vocabulary, cannot be prompted with domain terminology, and has privacy concerns for training contexts.

The dominant risk in this project is the iOS/Safari audio pipeline. Three separate verified WebKit bugs and MIME-type incompatibilities can cause silent capture failures, zero-byte blobs, or format-rejection by Whisper — each indistinguishable from the user's perspective. The mitigation strategy is clear: detect MIME type at runtime, validate blob size before sending, and test on real iOS hardware in standalone (installed) mode from day one, not at the end. Failing to do this early will cause a full rewrite of the audio capture layer mid-project.

---

## Key Findings

### Recommended Stack

The entire frontend is Vanilla HTML/CSS/JS (ES2022+), with no framework, no bundler, and no build step. This is the correct choice for a single-screen interaction loop — any framework adds overhead with no compositional benefit. The military dark aesthetic is implemented with CSS Custom Properties (zero runtime cost). PWA installability is achieved via a Web App Manifest v3 plus a minimal service worker; as of Chrome/Edge 2025, the manifest alone triggers the install prompt.

Audio capture uses `navigator.mediaDevices.getUserMedia` + `MediaRecorder` API (both native, no library needed). As of Safari 18.4 (March 2025), all three major browser engines support `audio/webm;codecs=opus`, but iOS 16/17 devices in the field will produce `audio/mp4` — runtime detection with `MediaRecorder.isTypeSupported()` is mandatory, not optional. Transcription is handled by OpenAI Whisper (`whisper-1` via `POST /v1/audio/transcriptions`), proxied through a Vercel serverless function (Node.js 20, native `fetch`, zero additional packages) to protect the API key.

**Core technologies:**
- Vanilla HTML/CSS/JS (ES2022+): App shell and all UI — no framework overhead for a single interaction loop
- MediaRecorder API (browser native): Push-to-talk audio capture — widest browser support, no library required
- OpenAI Whisper (`whisper-1`): Speech-to-text — highest accuracy for military/radio vocabulary; accepts both webm and mp4
- Vercel Serverless Function (Node.js 20): API key proxy — zero-config deployment alongside static files; Hobby tier is sufficient
- Web App Manifest v3 + Service Worker: PWA shell — installability on Android/iOS; offline load of app shell
- CSS Custom Properties: Military dark theme — zero runtime cost; define tokens once

### Expected Features

The project's feature set is intentionally narrow. The critical path is: PTT button -> MediaRecorder -> Vercel proxy -> Whisper -> transcript line. Everything else is either table stakes (users expect it) or an enhancement.

**Must have (table stakes):**
- Push-to-talk button with press-and-hold gesture — mirrors real RT discipline; uses `pointerdown`/`pointerup`
- Three-state visual mic feedback (idle / recording / processing) — no feedback means no trust in the tool
- Accurate transcription displayed immediately on release — the entire value proposition; 2s is the perceptible threshold
- Timestamped transmission log entries in monospace — RT training requires reviewing the sequence
- Mobile mic permission handling with clear error state on denial — silent failure is fatal on iOS
- iOS Safari and Android Chrome compatibility — target users are on mobile
- PWA installability (Add to Home Screen) — app-like experience without App Store
- API key secured server-side via Vercel function — non-negotiable for any public deployment
- Graceful error display on transcription failure — network issues cannot silently swallow recordings

**Should have (differentiators):**
- Military-aesthetic UI (black background, monospace, green/amber text, no consumer chrome) — reinforces RT discipline
- Proword highlighting in transcript (ROGER, WILCO, OUT, OVER) — client-side regex, no server round-trip
- Proword reference panel (collapsible) — eliminates context-switching to a manual mid-session
- Clear/Reset session button — one-tap clean slate between drills
- Haptic feedback on PTT press (`navigator.vibrate()`) — mirrors real PTT radio feel
- Offline app shell caching — field training environments have poor connectivity
- Portrait-locked mobile layout — RT trainers are used handheld in portrait

**Defer (v2+):**
- Automated RT scoring/grading — requires an RT grammar model that does not exist off the shelf
- Real-time streaming transcription — Whisper is batch-oriented; PTT is a natural chunking mechanism
- Session persistence / local storage — adds data model and state management; prototype doesn't need it
- Audio playback of recordings — users are checking transcript, not audio quality
- User accounts / auth — no multi-user need for the prototype
- TTS response simulation — entirely different product scope

### Architecture Approach

The architecture is a four-component linear pipeline deployed as a static Vercel project. There is no database, no backend service, and no state beyond the DOM. The Vercel proxy function is the only server-side code, and it is the only place the OpenAI API key exists. The client never touches the key. Steps 2 (audio capture) and 3 (Vercel proxy) can be built in parallel before integration in Step 4.

**Major components:**
1. **Audio Capture** (`js/audio.js`) — MediaRecorder lifecycle, PTT gesture, blob collection with MIME detection
2. **API Client** (`js/api.js`) — FormData construction, POST to `/api/transcribe`, loading/error state management
3. **Transcript Renderer** (`js/transcript.js`) — timestamped DOM append, auto-scroll, monospace military formatting
4. **Vercel Proxy** (`api/transcribe.js`) — parses FormData, forwards to Whisper with API key, returns JSON
5. **PWA Shell** (`sw.js` + `manifest.json`) — cache-first for static assets, network-only for `/api/*` routes

Entry point `app.js` wires PTT button events through the pipeline and manages the overall state machine (idle / recording / processing / error).

### Critical Pitfalls

1. **iOS standalone mode produces silent/zero-byte audio** (WebKit bug #185448) — validate `blob.size > 1000` before submitting; test on real iOS hardware in PWA standalone mode from day one; add `AudioContext` + `AnalyserNode` level meter to make silent captures visible
2. **MIME type mismatch between iOS Safari and Whisper** — detect MIME at runtime with `MediaRecorder.isTypeSupported()`; map to correct file extension (`recording.mp4` vs `recording.webm`) in FormData; hardcoding `audio/webm` breaks all pre-Safari-18.4 iOS devices
3. **MediaRecorder chunk concatenation — only first blob is decodable** — never pass `timeslice` to `start()` for PTT; collect all `ondataavailable` chunks into an array and assemble a single Blob on `onstop`
4. **touchcancel loses recording mid-session** — handle both `touchend` AND `touchcancel` (or use Pointer Events API `pointerup`/`pointercancel`); add a 30-second max recording timer as a safety net
5. **Whisper misreads military vocabulary** — pass a rich `prompt` parameter with domain vocabulary (SUNRAY, NINER, WILCO, SITREP, CASEVAC); add a post-processing normalisation pass for known misreadings before displaying the transcript

---

## Implications for Roadmap

Research points clearly to a five-phase build sequence. Phases 2 and 3 are independently buildable in parallel; all other phases are strictly sequential.

### Phase 1: Static Shell + PWA Plumbing

**Rationale:** Establishes the visual and structural foundation before any audio or API logic. Produces a testable, installable artifact immediately. iOS installability must be confirmed before audio work begins, or the WebKit standalone-mode bug (Pitfall 2) will be discovered too late.
**Delivers:** Installable PWA with correct military visual states, no functionality. Chrome DevTools installability checklist passes. All CSS states (idle/recording/processing/error) are visually correct.
**Addresses:** PWA installability (table stakes), military aesthetic (differentiator), portrait lock, manifest + service worker
**Avoids:** Service worker caching of API routes (Pitfall 7) — configure network-only for `/api/*` now, before the proxy exists

### Phase 2: Audio Capture

**Rationale:** Audio is the riskiest technical component. Building and validating it in isolation — before any API integration — isolates bugs to the audio layer. Real-device iOS testing happens here, not at the end.
**Delivers:** Confirmed blob production on PTT gesture across Chrome, Android Chrome, and iOS Safari in both browser and standalone mode. Blob size validated. MIME type detected at runtime.
**Addresses:** PTT button gesture, mic permission handling, iOS compatibility
**Avoids:** Chunk concatenation error (Pitfall 3), MIME type mismatch (Pitfall 4), touchcancel loss (Pitfall 8), iOS standalone silent audio (Pitfall 2), stream state error (Pitfall 13)

### Phase 3: Vercel Proxy

**Rationale:** Can be built in parallel with Phase 2. Verified independently via curl before any frontend integration. This isolation confirms Whisper accuracy and API key security before touching the browser.
**Delivers:** Working `/api/transcribe` endpoint that accepts a multipart audio blob, calls Whisper, and returns `{ text }`. Tested with a real audio file via curl or Postman.
**Uses:** Vercel serverless function (Node.js 20, native fetch), `OPENAI_API_KEY` environment variable, Whisper `whisper-1` with `language: 'en'` and domain `prompt`
**Avoids:** API key in client (Pitfall — anti-pattern 2), Vercel 4.5 MB body limit (Pitfall 1 — addressed by 16 kbps bitrate and PTT clip duration)

### Phase 4: Full Pipeline Integration

**Rationale:** Only after Phases 2 and 3 are independently validated does integration make sense. Bugs in integration are network/state bugs, not audio or API bugs — this ordering makes debugging tractable.
**Delivers:** End-to-end PTT transcription working: press button, speak, release, see timestamped transcript line. Full state machine (idle / recording / processing / error) functional.
**Implements:** API Client module (`js/api.js`), Transcript Renderer (`js/transcript.js`), app.js state machine orchestration
**Avoids:** Monolithic app.js anti-pattern (Architecture anti-pattern 4) — three focused modules tested independently

### Phase 5: Polish, Resilience, and Differentiators

**Rationale:** Proword highlighting, haptic feedback, error recovery, and offline resilience add significant user value for the target audience but must not block the core loop validation. This phase also hardens the deployment for actual field use.
**Delivers:** Proword highlighting in transcript, proword reference panel, Clear/Reset button, haptic feedback, Whisper vocabulary normalisation post-processing, WakeLock API integration, visibility change handler, permission denial recovery flow
**Addresses:** Proword highlighting (differentiator), vocabulary normalisation (Pitfall 9), background tab kill (Pitfall 10), permission denial recovery (Pitfall 11), AudioContext suspension (Pitfall 6)

### Phase Ordering Rationale

- Phase 1 before Phase 2 because the iOS standalone-mode audio bug (Pitfall 2) is only reproducible on an installed PWA — the manifest and service worker must exist first
- Phases 2 and 3 are independent — both can run in parallel, cutting development time by one phase
- Phase 4 after both 2 and 3 because integration bugs are easier to isolate when each component is confirmed working in isolation
- Phase 5 last because all differentiators depend on a working transcription pipeline; building them before Phase 4 is wasted effort if the core loop has issues

### Research Flags

Phases with well-documented patterns (can proceed without deeper research):
- **Phase 1 (PWA shell):** Established patterns; MDN PWA tutorials are authoritative; manifest and service worker requirements are fully documented
- **Phase 3 (Vercel proxy):** Zero-config convention is well-documented; Vercel official docs are the complete reference
- **Phase 4 (Integration):** Standard fetch + FormData patterns; fully covered in ARCHITECTURE.md

Phases likely needing real-device validation (not research, but testing):
- **Phase 2 (Audio capture):** iOS standalone-mode silent audio bug requires real hardware test — emulators do not reproduce WebKit permission context differences. Allocate time for this explicitly.

Phases where implementation decisions require validation during planning:
- **Phase 5 (Vocabulary normalisation):** The Whisper `prompt` parameter steers but does not guarantee vocabulary. The degree of post-processing needed is unknown until Phase 4 is running with real military speech. Plan a spike in Phase 4 to characterise Whisper accuracy on target vocabulary before committing to a normalisation strategy.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technology choices verified against MDN, Vercel official docs, OpenAI docs. No speculative choices. |
| Features | HIGH | Table stakes derived directly from project brief and corroborated by ARSim analogue. iOS MIME type constraint confirmed by multiple developer sources. |
| Architecture | HIGH | Four-component pipeline is the canonical pattern for this type of app. All constraints (4.5 MB limit, 300s timeout, 25 MB Whisper limit) verified against official docs. |
| Pitfalls | HIGH (infrastructure), MEDIUM (iOS-specific) | Vercel limits, Whisper limits, blob concatenation rules: HIGH via official docs. iOS standalone audio bug: MEDIUM — verified via WebKit bugtracker and developer community, but iOS 18+ behavior is improved. |

**Overall confidence:** HIGH

### Gaps to Address

- **Whisper accuracy on military vocabulary:** Unknown until Phase 4 runs with real military speech. The `prompt` parameter is the primary mitigation, but normalisation regex may need to be built iteratively based on observed failures. Do not commit to a scoring/evaluation architecture until this is characterised.
- **iOS 16/17 device availability for testing:** The silent audio bug is most severe on iOS 16 and 17. If field test devices are all iOS 18+, the bug may not reproduce — but it still affects military personnel on older hardware. Clarify target device baseline during planning.
- **Vercel Hobby vs. Pro timeout:** PITFALLS.md notes a 10-second function timeout on Hobby plan, but ARCHITECTURE.md (verified 2026-03-25 against current Vercel docs) states the Hobby default is 300 seconds. This discrepancy should be confirmed in the Vercel dashboard before deployment. The ARCHITECTURE.md figure (300s) is the more recent verification. Either way, a client-side 30-second recording cap keeps worst-case Whisper latency well within any reasonable timeout.

---

## Sources

### Primary (HIGH confidence)
- [MDN MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder) — MediaRecorder API, MIME type support, chunk behavior
- [MDN MediaDevices.getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) — HTTPS requirement, permission model
- [Vercel Functions Limitations](https://vercel.com/docs/functions/limitations) — 4.5 MB body limit, 300s Hobby timeout (verified 2026-03-25)
- [Vercel Functions overview](https://vercel.com/docs/functions) — `api/` directory convention, zero-config deployment
- [OpenAI Audio API FAQ](https://help.openai.com/en/articles/7031512-audio-api-faq) — 25 MB file limit, supported formats, `whisper-1` model
- [MDN PWA Installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable) — manifest requirements, service worker role
- [MDN Service Workers / App Shell Pattern](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Tutorials/js13kGames/Offline_Service_workers) — cache-first strategy, `/api/*` exclusion

### Secondary (MEDIUM confidence)
- [Cross-browser MIME support for webm/opus](https://media-codings.com/articles/recording-cross-browser-compatible-media) — Safari 18.4 webm support confirmation
- [iOS Safari MediaRecorder + Whisper implementation](https://www.buildwithmatija.com/blog/iphone-safari-mediarecorder-audio-recording-transcription) — iOS mp4 fallback pattern
- [PWA iOS Limitations 2026 — MagicBell](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide) — standalone mode constraints
- [WebKit bug #185448](https://bugs.webkit.org/show_bug.cgi?id=185448) — getUserMedia silent in standalone PWA
- [WebKit bug #198277](https://bugs.webkit.org/show_bug.cgi?id=198277) — audio stops in background standalone web app
- [Whisper prompting guide — OpenAI cookbook](https://developers.openai.com/cookbook/examples/whisper_prompting_guide) — domain vocabulary prompt steering
- [PlaneEnglish ARSim](https://arsim.ai/) — closest analogue product (aviation RT trainer); feature patterns
- [PWA Web Almanac 2025 — HTTP Archive](https://almanac.httparchive.org/en/2025/pwa) — PWA adoption and capability patterns
- [MediaRecorder chunk audio corruption — RecordRTC issue](https://github.com/muaz-khan/RecordRTC/issues/539) — chunk-only decodability documentation

### Tertiary (LOW confidence)
- [PWA installability 2025 blog](https://blog.madrigan.com/en/blog/202603030957/) — manifest-only install prompt (Chrome/Edge); needs direct DevTools verification during Phase 1

---

*Research completed: 2026-03-25*
*Ready for roadmap: yes*
