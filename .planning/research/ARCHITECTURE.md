# Architecture Patterns

**Project:** RADStrat RT Trainer
**Domain:** Vanilla JS PWA — push-to-talk transcription
**Researched:** 2026-03-25
**Confidence:** HIGH (all claims verified against MDN, official Vercel docs, OpenAI docs)

---

## Recommended Architecture

A four-component linear pipeline. No framework, no build step, no bundler. Every component is a single file or a small focused module. The entire app ships as a static directory deployed to Vercel.

```
┌─────────────────────────────────────────────────────────────────┐
│  PWA Shell (service worker + manifest.json)                     │
│  ─ Caches static assets for offline load                        │
│  ─ Registers install prompt                                     │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐     │
│  │  index.html  (single screen, all UI)                   │     │
│  │                                                        │     │
│  │  [Audio Capture Module]   [Transcript Renderer]        │     │
│  │   mic-button state        DOM append + scroll          │     │
│  │   MediaRecorder           timestamp + line format      │     │
│  │   blob collection         monospace military style     │     │
│  │         │                                              │     │
│  │         ▼                                              │     │
│  │  [API Client Module]                                   │     │
│  │   FormData construction                                │     │
│  │   POST /api/transcribe                                 │     │
│  │   loading/error state                                  │     │
│  └────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
         │
         │  HTTPS POST multipart/form-data (audio blob)
         ▼
┌────────────────────────────────┐
│  /api/transcribe.js            │
│  Vercel serverless function    │
│  ─ Parse FormData              │
│  ─ Forward to Whisper API      │
│  ─ Return { text: "..." }      │
└────────────────────────────────┘
         │
         │  HTTPS POST multipart/form-data (audio file)
         ▼
┌────────────────────────────────┐
│  OpenAI Whisper API            │
│  model: whisper-1              │
│  Returns: { text: "..." }      │
└────────────────────────────────┘
```

---

## Component Boundaries

| Component | File(s) | Responsibility | Communicates With |
|-----------|---------|----------------|-------------------|
| Audio Capture | `js/audio.js` | Request mic permission, manage MediaRecorder lifecycle (start/stop on PTT gesture), collect webm/opus chunks into a Blob | API Client |
| API Client | `js/api.js` | Build FormData from Blob, POST to `/api/transcribe`, handle loading/error states, return transcript text | Audio Capture (receives blob), Transcript Renderer (sends text) |
| Transcript Renderer | `js/transcript.js` | Append timestamped lines to the transcript panel DOM, auto-scroll, manage session line history | API Client (receives text) |
| PWA Shell | `sw.js` + `manifest.json` | Cache static assets on install, serve from cache on fetch, enable installability | Browser (no app logic) |
| Vercel Proxy | `api/transcribe.js` | Parse incoming FormData, reconstruct as File for OpenAI SDK, call `openai.audio.transcriptions.create`, return JSON | API Client (receives request), Whisper (sends file) |

**Hard boundary:** The Vercel proxy is the only place the OpenAI API key exists. The client never touches the key. The proxy is the only server-side code.

---

## Data Flow

```
[User holds mic button]
        │
        ▼
[mousedown / touchstart]
  → Audio Capture: getUserMedia() if not yet acquired
  → MediaRecorder.start()

[User releases mic button]
        │
        ▼
[mouseup / touchend / touchcancel]
  → MediaRecorder.stop()
  → ondataavailable fires → chunks[] populated
  → onstop fires → new Blob(chunks, { type: 'audio/webm;codecs=opus' })

[Blob ready]
        │
        ▼
[API Client]
  → UI enters "processing" state (spinner, button disabled)
  → const fd = new FormData()
  → fd.append('audio', blob, 'recording.webm')
  → fetch('/api/transcribe', { method: 'POST', body: fd })

[Vercel Function /api/transcribe.js]
  → const form = await req.formData()
  → const file = form.get('audio')          // File object
  → openai.audio.transcriptions.create({
        file: file,
        model: 'whisper-1',
        language: 'en'
      })
  → return Response.json({ text: transcript })

[Response arrives at client]
        │
        ▼
[API Client]
  → UI exits processing state
  → passes { text } to Transcript Renderer

[Transcript Renderer]
  → const ts = new Date().toLocaleTimeString('en-GB', { hour12: false })
  → Prepend timestamp: "[HH:MM:SS] {text}"
  → document.createElement('p'), append to #transcript-panel
  → panel.scrollTop = panel.scrollHeight
  → Button returns to idle state, ready for next transmission
```

**Error path:** If fetch fails or API returns non-200, the API Client updates the UI with a brief error indicator and resets button to idle. No transcript line is appended.

---

## File Responsibilities

```
project-root/
├── index.html              # Single screen HTML. Imports all JS/CSS. Contains
│                           # mic button #ptt-button, transcript panel
│                           # #transcript-panel, status indicator #status.
│                           # Links manifest.json, registers service worker.
│
├── css/
│   └── style.css           # Military dark theme, monospace font, PTT button
│                           # states (idle/recording/processing), pulsing
│                           # animation, mobile-first responsive layout.
│
├── js/
│   ├── audio.js            # AudioCapture class or module. Owns MediaRecorder
│   │                       # lifecycle. Exports: startRecording(), stopRecording()
│   │                       # → Promise<Blob>. Handles getUserMedia permissions.
│   │
│   ├── api.js              # ApiClient module. Exports: transcribe(blob)
│   │                       # → Promise<string>. Owns fetch call to
│   │                       # /api/transcribe. Sets and clears loading UI state.
│   │
│   ├── transcript.js       # TranscriptRenderer module. Exports: appendLine(text).
│   │                       # Handles timestamp formatting, DOM append,
│   │                       # auto-scroll. Owns the #transcript-panel element.
│   │
│   └── app.js              # Entry point. Wires PTT button events to audio.js,
│                           # chains audio.js → api.js → transcript.js.
│                           # Manages overall UI state machine (idle / recording /
│                           # processing / error).
│
├── api/
│   └── transcribe.js       # Vercel serverless function. Handles POST only.
│                           # Reads OPENAI_API_KEY from process.env. Parses
│                           # FormData, calls OpenAI SDK, returns JSON.
│                           # Never imported by client code.
│
├── manifest.json           # PWA manifest. name, short_name, start_url ("/"),
│                           # display: "standalone", theme_color, background_color,
│                           # icons array (192x192, 512x512 minimum).
│
├── sw.js                   # Service worker. Caches: index.html, style.css,
│                           # all js/*.js files, manifest.json, icons.
│                           # Strategy: cache-first for shell assets, network-only
│                           # for /api/* routes (transcription requires network).
│
├── icons/                  # PWA icons. icon-192.png, icon-512.png minimum.
│
└── vercel.json             # Optional: function timeout config if needed.
                            # For short voice clips this is unlikely to be
                            # necessary (see constraints section below).
```

---

## Suggested Build Order

Build in this sequence — each step has no dependency on the next:

**Step 1: Static shell + PWA plumbing** (no audio, no API)
- `index.html` with mic button and transcript panel DOM
- `css/style.css` with military dark theme and all button states
- `manifest.json` with icons
- `sw.js` caching static assets
- Goal: installable PWA with correct visual states, no functionality

**Step 2: Audio capture** (no API yet)
- `js/audio.js` — MediaRecorder on PTT gesture, returns Blob
- `js/app.js` — wire button events, log blob size to console
- Goal: confirm mic permission flow, blob is produced on button release

**Step 3: Vercel proxy** (no frontend integration yet)
- `api/transcribe.js` — serverless function
- Test with curl or Postman: `curl -F audio=@test.webm https://[url]/api/transcribe`
- Goal: confirm OpenAI API key is secured, Whisper returns text

**Step 4: Full pipeline integration**
- `js/api.js` — fetch call wiring Step 2 output to Step 3 endpoint
- `js/transcript.js` — DOM rendering of Whisper response
- `js/app.js` — full state machine (idle → recording → processing → idle)
- Goal: end-to-end transcription working

**Step 5: Polish and edge cases**
- Error handling (mic denied, network failure, API error)
- `touchcancel` event handling (finger slides off button)
- Empty blob guard (user releases immediately without speaking)
- Service worker update strategy

**Dependency diagram:**
```
Step 1 (shell)
    │
    ├── Step 2 (audio)  ──────────────────┐
    │                                     │
    └── Step 3 (proxy)  ─────────────────►│
                                          ▼
                                    Step 4 (integration)
                                          │
                                          ▼
                                    Step 5 (polish)
```

Steps 2 and 3 can be built in parallel.

---

## Architecture Constraints and Verified Facts

**Vercel body size limit: 4.5 MB** (HIGH confidence — verified against official Vercel docs)
- webm/opus at 32 kbps (typical voice quality from MediaRecorder default) = ~4 KB/second
- A 30-second push-to-talk transmission = ~120 KB
- A 60-second transmission = ~240 KB
- Conclusion: the 4.5 MB limit is not a concern for this use case. Military RT transmissions are typically 3–30 seconds. You would need a 9+ minute continuous recording to approach the limit.

**Vercel function timeout: 300 seconds default on Hobby plan** (HIGH confidence — verified against official Vercel docs, 2026-03)
- Note: older documentation (pre-2024) stated 10 seconds. This is outdated. Current Hobby plan default is 300s.
- Whisper API on short voice clips (under 60 seconds) typically responds in 1–5 seconds.
- Conclusion: timeout is not a concern. No `vercel.json` timeout config needed for this use case.

**OpenAI Whisper API file size limit: 25 MB** (HIGH confidence — verified against OpenAI docs)
- Push-to-talk blobs will be 10 KB – 500 KB. No chunking needed.

**MediaRecorder MIME type: `audio/webm;codecs=opus`** (HIGH confidence — MDN)
- Supported in Chrome, Edge, Firefox on desktop and Android.
- Safari/iOS: Safari supports `audio/mp4` not webm. Use `MediaRecorder.isTypeSupported()` to detect and fall back to `audio/mp4` if needed. This is a real cross-browser concern worth addressing in Step 5.

**Whisper accepts webm directly** (HIGH confidence — OpenAI audio API docs)
- Supported formats: mp3, mp4, mpeg, mpga, m4a, wav, webm
- No client-side re-encoding needed.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Recording audio client-side in uncompressed format
**What:** Capturing as WAV/PCM instead of webm/opus
**Why bad:** 16-bit mono at 16kHz = ~32 KB/second. A 30-second clip = ~960 KB. Still under limits, but 8x larger than opus with no quality benefit for transcription.
**Instead:** Accept the browser's default webm/opus. It is sufficient for Whisper.

### Anti-Pattern 2: Piping the OpenAI API key through environment variables exposed to the frontend build
**What:** Using a `.env` file loaded into client-side JS
**Why bad:** Vanilla JS has no build step that strips env vars. The key will be visible in source.
**Instead:** API key lives only in Vercel environment variables, accessed only in `api/transcribe.js` via `process.env.OPENAI_API_KEY`.

### Anti-Pattern 3: Caching API routes in the service worker
**What:** Service worker intercepts `/api/transcribe` and tries to serve from cache
**Why bad:** Transcription requires a live network call. A cached response is stale and meaningless.
**Instead:** Service worker uses `network-only` strategy for all `/api/*` routes. If offline, let the fetch fail gracefully — display "No network connection" in the UI.

### Anti-Pattern 4: Monolithic app.js doing all the work
**What:** Putting MediaRecorder logic, fetch logic, and DOM manipulation in one 500-line file
**Why bad:** Hard to test each phase in isolation during the Step 2/3/4 build order. A bug in the fetch call is mixed with audio bugs.
**Instead:** Three focused modules (audio.js, api.js, transcript.js) connected by a thin app.js orchestrator. Each module can be tested with a simple console call during development.

### Anti-Pattern 5: Starting MediaRecorder recording before getUserMedia resolves
**What:** Calling `mediaRecorder.start()` synchronously on button press without awaiting permission
**Why bad:** First button press will always fail silently if permission hasn't been granted yet.
**Instead:** Request `getUserMedia` on first button press and `await` it. Cache the stream for subsequent presses. Show a "Please allow microphone access" message if permission is denied.

---

## Scalability Considerations

This is a stateless, single-user prototype. Scalability is not a concern. The architecture is already as simple as it gets. Notes for if this ever grows:

| Concern | Current (prototype) | If multi-user/session needed |
|---------|--------------------|-----------------------------|
| Transcript persistence | In-memory DOM only | Add localStorage or IndexedDB |
| Session history | Lost on page refresh | Server-side storage (out of scope for v1) |
| API rate limiting | Single user, low volume | Add request queuing or debounce |
| Audio quality | Default MediaRecorder settings | Add AudioContext pre-processing |

---

## Sources

- [MediaRecorder — MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder) — HIGH confidence
- [MediaStream Recording API — MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Recording_API) — HIGH confidence
- [Vercel Functions Limits — Official Vercel Docs](https://vercel.com/docs/functions/limitations) — HIGH confidence (verified 2026-03-25: Hobby timeout is 300s default)
- [Vercel Body Size Limit Knowledge Base](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions) — HIGH confidence (4.5 MB request body limit confirmed)
- [OpenAI Audio API FAQ](https://help.openai.com/en/articles/7031512-audio-api-faq) — HIGH confidence (25 MB file size limit, webm supported)
- [Service Workers and App Shell Pattern — MDN PWA Tutorial](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Tutorials/js13kGames/Offline_Service_workers) — HIGH confidence
- [CycleTracker: Service Workers — MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Tutorials/CycleTracker/Service_workers) — HIGH confidence
