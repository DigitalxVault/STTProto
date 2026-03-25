# Technology Stack

**Project:** RADStrat RT Trainer
**Researched:** 2026-03-25
**Overall confidence:** HIGH — all major claims verified against MDN, Vercel official docs, or OpenAI community sources.

---

## Recommended Stack

### Frontend

| Technology | Version / API | Purpose | Why |
|------------|---------------|---------|-----|
| Vanilla HTML/CSS/JS | ES2022+ | App shell | No framework overhead; PWA + audio recording needs no abstraction layer. Plain JS is lighter and avoids build tooling complexity for a single-purpose app. |
| CSS Custom Properties | Native | Theming / dark military aesthetic | Zero runtime cost. Define color tokens once (`--color-primary`, `--bg-base`) and reference everywhere. |
| Web App Manifest | Manifest v3 | PWA installability | Enables "Add to Home Screen". As of Chrome/Edge 2024+, a manifest alone (without service worker) triggers the install prompt. |
| Service Worker | Cache API | Offline shell / asset caching | Cache the app shell (HTML, CSS, JS, icons) so it loads instantly. Do NOT cache Whisper API responses — they are ephemeral. Use a **cache-first** strategy for static assets. |

### Audio Capture

| Technology | Configuration | Purpose | Why |
|------------|---------------|---------|-----|
| `navigator.mediaDevices.getUserMedia` | `{ audio: true, video: false }` | Mic access | Only API for browser mic capture. Requires HTTPS. Requires explicit user gesture before calling (cannot call on page load). |
| `MediaRecorder` API | See configuration section | Push-to-talk recording | Native browser API. Widely available since April 2021. No library needed for modern browsers. |
| MIME type: `audio/webm;codecs=opus` | Primary | Audio format | As of Safari 18.4 (March 2025), all three major engines — Blink (Chrome/Edge), Gecko (Firefox), and WebKit (Safari) — support `audio/webm;codecs=opus`. Use `MediaRecorder.isTypeSupported()` to confirm before constructing the recorder. |
| MIME type: `audio/mp4` | Fallback | iOS < Safari 18.4 | Pre-18.4 iOS Safari does not support webm; it records as `audio/mp4` (AAC). Whisper accepts both. Detect and branch accordingly. |

### API Integration

| Technology | Endpoint | Purpose | Why |
|------------|----------|---------|-----|
| OpenAI Whisper | `POST /v1/audio/transcriptions` | Speech-to-text | Highest accuracy for military/radio phraseology. Model `whisper-1` (powered by Whisper V2). NEW in 2025: `gpt-4o-transcribe` and `gpt-4o-mini-transcribe` also available but are streaming-only with higher latency per short clip. Stick to `whisper-1` for push-to-talk bursts. |
| `fetch` API | Browser native | HTTP requests to proxy | Supported universally. Send `multipart/form-data` to the Vercel proxy, not directly to OpenAI. |
| `FormData` | Browser native | Build multipart upload | `FormData.append('file', blob, 'audio.webm')` — the filename extension matters; Whisper uses it to detect format. |

### Backend / API Proxy

| Technology | Runtime | Purpose | Why |
|------------|---------|---------|-----|
| Vercel Serverless Function | Node.js 20 | Proxy Whisper API calls, hide API key | API key must never be in browser. Vercel `api/` directory convention requires zero configuration for a vanilla JS project — place `api/transcribe.js` and it auto-deploys. |
| Vercel Hobby tier | Free | Hosting | Adequate for prototype: 300s max duration (Whisper calls complete in < 5s), 2 GB memory, 4.5 MB request body limit. |

---

## MediaRecorder Configuration

This is the most implementation-critical part. Get it wrong and Whisper rejects the file.

### MIME Type Detection Pattern

```javascript
function getSupportedMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',      // iOS Safari < 18.4 fallback
    'audio/ogg;codecs=opus',  // Firefox desktop only, not iOS
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';  // Let browser choose; may cause Whisper rejection
}
```

### Recorder Construction

```javascript
const mimeType = getSupportedMimeType();
const recorder = new MediaRecorder(stream, {
  mimeType,
  audioBitsPerSecond: 16000,  // 16 kbps is sufficient for voice; reduces file size
});
```

**Why 16 kbps:** Whisper processes voice, not music. Lower bitrate means smaller payloads, faster upload to Vercel proxy, well under the 4.5 MB limit even for 30-second clips.

### Push-to-Talk Collection Pattern

```javascript
let chunks = [];

recorder.ondataavailable = (e) => {
  if (e.data.size > 0) chunks.push(e.data);
};

recorder.onstop = async () => {
  const blob = new Blob(chunks, { type: mimeType });
  chunks = [];  // Reset immediately — important for repeated PTT presses
  await sendToWhisper(blob, mimeType);
};

// PTT button down
recorder.start();

// PTT button up
recorder.stop();  // Triggers onstop after data is flushed
```

**Do NOT pass a `timeslice` to `start()`** for PTT. Timeslicing is for streaming; PTT collects one complete blob per press, which is simpler and sufficient.

---

## Whisper API — Request Format and Limits

**Endpoint:** `POST https://api.openai.com/v1/audio/transcriptions`
**Authentication:** `Authorization: Bearer {OPENAI_API_KEY}` — set in Vercel env var, never in browser.

### Required Parameters

| Field | Value | Note |
|-------|-------|------|
| `file` | Audio blob | Must have a filename with correct extension (`.webm`, `.mp4`, `.wav`) |
| `model` | `whisper-1` | Only production-stable non-streaming model as of 2025 |

### Optional Parameters (relevant to this project)

| Field | Value | Note |
|-------|-------|------|
| `language` | `en` | Force English; improves accuracy and speed |
| `response_format` | `json` (default) or `text` | `text` returns bare string; `json` returns `{ "text": "..." }` |
| `prompt` | `"RADALT, WILCO, STANDBY, NEGATIVE, AFFIRM"` | Seed the model with domain vocabulary; significantly improves military RT phrase recognition |

### Limits

| Constraint | Value | Impact |
|------------|-------|--------|
| Max file size | 25 MB | Push-to-talk clips at 16 kbps are typically 5–200 KB; no concern |
| Supported formats | mp3, mp4, mpeg, mpga, m4a, wav, webm | webm and mp4 cover all modern browser output |
| Streaming | Not supported on whisper-1 | Use standard request/response pattern |
| Rate limits | Tier-dependent; default ~50 req/min for paid accounts | More than sufficient for single-user prototype |

---

## Vercel Serverless Function — Proxy Setup

### File Convention

```
project-root/
  index.html
  app.js
  style.css
  manifest.json
  sw.js
  api/
    transcribe.js   ← Vercel auto-deploys this as /api/transcribe
  vercel.json       ← Optional; needed only if custom routing required
```

No `vercel.json` configuration is required for the basic pattern. Vercel detects `api/` automatically.

### Function Pattern

```javascript
// api/transcribe.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Forward the multipart/form-data body to OpenAI
  // Use node-fetch or the native fetch (Node 18+)
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      // Do NOT set Content-Type manually — let fetch set the boundary
    },
    body: req.body,  // Pass through the raw multipart body
  });

  const data = await response.json();
  return res.status(response.status).json(data);
}
```

**Critical note on body passthrough:** Vercel's Node.js runtime parses the request body by default. For `multipart/form-data` passthrough, you need to either disable body parsing or reconstruct the FormData. The simplest pattern for this use case: receive the raw audio bytes from the browser as `application/octet-stream`, reconstruct FormData server-side.

### Environment Variable

Set in Vercel dashboard under Project Settings > Environment Variables:
- `OPENAI_API_KEY` = `sk-...`
- Scope: Production + Preview (not needed locally unless testing with `vercel dev`)

### 4.5 MB Body Limit

Vercel enforces a hard **4.5 MB** limit on request bodies (confirmed in official docs). At 16 kbps:
- 30 seconds of audio ≈ 60 KB
- 2 minutes of audio ≈ 240 KB
- The limit is 4.5 MB ≈ ~37 minutes of audio at this bitrate

PTT clips are measured in seconds. This limit is not a concern for this use case.

---

## PWA Manifest — Minimum Required Fields

```json
{
  "name": "RADStrat RT Trainer",
  "short_name": "RADStrat",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#000000",
  "theme_color": "#000000",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

**Important 2025 change:** Chrome and Edge no longer require a service worker to show the install prompt — only the manifest. However, a service worker is still required for true offline capability. Include one for shell caching.

### Service Worker — Minimal Pattern

```javascript
// sw.js
const CACHE_NAME = 'radstrat-v1';
const SHELL_ASSETS = ['/', '/index.html', '/app.js', '/style.css', '/manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(SHELL_ASSETS)));
});

self.addEventListener('fetch', (e) => {
  // Cache-first for shell; network-only for /api/* routes
  if (e.request.url.includes('/api/')) return;
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
```

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Framework | Vanilla JS | React / Vue | Adds build step, dependencies, bundle size. The app is a single interaction loop; no framework is justified. |
| Transcription model | `whisper-1` | `gpt-4o-transcribe` | gpt-4o variants require streaming response handling. whisper-1 returns a simple JSON response, which is simpler for one-shot PTT clips. Also lower latency for short audio. |
| Audio format | webm/opus | WAV | WAV is uncompressed and 10-20x larger. webm/opus is natively produced by MediaRecorder on all modern browsers and accepted by Whisper. |
| API proxy | Vercel serverless | None (direct from browser) | Never expose the API key in client-side code. |
| API proxy | Vercel serverless | Express.js on Railway/Render | Vercel is zero-config for this pattern and co-hosts static files. No separate deployment to manage. |
| Mic polyfill | Native getUserMedia | opus-media-recorder | Polyfill needed only for Safari < 18.4 (March 2025). Given the 18.4 release, native support is sufficient for a prototype targeting current devices. Document this assumption. |

---

## Browser Support Summary

| Feature | Chrome | Firefox | Safari | iOS Safari |
|---------|--------|---------|--------|------------|
| `getUserMedia` | 53+ | 36+ | 11+ | 11+ |
| `MediaRecorder` | 47+ | 25+ | 14.1+ | 14.5+ |
| `audio/webm;codecs=opus` | Yes | Yes | 18.4+ (Mar 2025) | 18.4+ (Mar 2025) |
| `audio/mp4` fallback | No | No | Yes (pre-18.4) | Yes (pre-18.4) |
| Service Worker | 40+ | 44+ | 11.1+ | 11.3+ |
| PWA Install Prompt | Yes | Partial | Limited | Limited |

**Confidence: HIGH** (MDN, Safari 18.4 release notes, media-codings.com cross-browser analysis)

**iOS Caveat:** getUserMedia permissions in iOS Safari are the least persistent of any browser — users will be re-prompted more frequently than on Android Chrome. This is a platform limitation; no workaround exists beyond clear UX guidance to "allow microphone."

---

## Installation

No package manager required for the frontend. The only dependency is the Vercel proxy function.

```bash
# Install Vercel CLI (development only)
npm install -g vercel

# For the API function — no npm install needed if using Node 18+ native fetch
# If targeting Node 16, add node-fetch:
# npm init -y && npm install node-fetch
```

For the Vercel function, Node.js 20 runtime uses native `fetch` — no additional packages required.

---

## Sources

| Source | Confidence | URL |
|--------|------------|-----|
| MDN MediaRecorder | HIGH | https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder |
| MDN isTypeSupported | HIGH | https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static |
| Cross-browser MIME support (webm/opus) | HIGH | https://media-codings.com/articles/recording-cross-browser-compatible-media |
| iOS Safari MediaRecorder compatibility | MEDIUM | https://www.buildwithmatija.com/blog/iphone-safari-mediarecorder-audio-recording-transcription |
| Vercel Functions limits (official) | HIGH | https://vercel.com/docs/functions/limitations |
| Vercel Functions overview (official) | HIGH | https://vercel.com/docs/functions |
| OpenAI Whisper API FAQ | MEDIUM | https://help.openai.com/en/articles/7031512-whisper-api-faq |
| OpenAI Whisper API formats/limits (community) | MEDIUM | https://community.openai.com/t/whisper-api-limits-transcriptions/167507 |
| PWA installability 2025 | MEDIUM | https://blog.madrigan.com/en/blog/202603030957/ |
| MDN PWA installable | HIGH | https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable |
| getUserMedia HTTPS requirement | HIGH | https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia |
