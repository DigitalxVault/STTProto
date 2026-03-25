# Domain Pitfalls

**Domain:** PWA push-to-talk audio trainer (MediaRecorder + Whisper API + Vercel)
**Project:** RADStrat RT Trainer — military RT voice training
**Researched:** 2026-03-25
**Confidence:** HIGH for infrastructure/API limits (verified official docs), MEDIUM for iOS-specific bugs (community reports, WebKit bugtracker), HIGH for blob handling (MDN spec)

---

## Critical Pitfalls

Mistakes that cause rewrites or non-functional audio pipelines.

---

### Pitfall 1: Vercel 4.5 MB Serverless Request Body Limit

**What goes wrong:** Audio recordings sent as multipart form data through a Vercel serverless function (e.g., `/api/transcribe`) hit a hard 4.5 MB request body cap and return 413 errors. A single 30-second opus/webm recording at typical bitrates lands comfortably within 1-2 MB, but longer takes or accidental full-file re-sends can exceed the limit. Whisper's own cap is 25 MB — you will never reach Whisper's limit if you hit Vercel's first.

**Why it happens:** Vercel serverless functions are not designed as media ingress points. The limit is architectural, not configurable in `vercel.json` on Hobby/Pro plans. Multipart encoding adds overhead on top of raw audio bytes.

**Consequences:** Silent 413 failures if not handled, or confusing error responses that look like Whisper rejections. Users lose recordings.

**Prevention:**
- Keep individual PTT presses short (under 60 seconds) by enforcing a max recording duration on the client.
- Stream audio as a `Blob` directly to Vercel Blob Storage (or Supabase Storage) from the client, then pass only the URL to the serverless function. The serverless function fetches from storage and forwards to Whisper — bypassing body limits entirely.
- As a simpler fallback for short recordings: compress to target under 1 MB before sending. Opus at 16 kbps mono yields ~120 KB/minute — plenty of headroom.

**Detection (warning signs):**
- API route returns 413 or "request entity too large"
- Works in local dev, fails on Vercel
- Fails only for longer recordings

**Phase:** Address in Phase 1 (API integration). Decide architecture (direct upload vs. proxy) before wiring the transcription pipeline.

---

### Pitfall 2: iOS Safari/PWA Standalone Mode Produces Silent or Zero-Byte Audio

**What goes wrong:** On iOS, when a PWA is installed to the home screen (standalone mode), `getUserMedia` may grant mic permission but `MediaRecorder` records silence or produces a 44-byte stub file. This is a WebKit bug (documented at bugs.webkit.org #185448). The app appears to work — the recorder starts, stops, and emits a Blob — but the Blob contains only a WAV header with no audio data.

**Why it happens:** iOS PWA standalone mode historically had a different permission context than Safari in-browser. The mic stream was granted but the actual audio capture was silently severed at the OS/WebKit level.

**Consequences:** The transcription pipeline receives an effectively empty file. Whisper returns an empty string or a hallucinated response ("Thank you." is a known Whisper response to silence). The user hears nothing is wrong but gets no transcript.

**Prevention:**
- Check `blob.size > 1000` before submitting to the transcription endpoint. Reject and prompt the user to retry if the blob is suspiciously small.
- Test on real iOS hardware in standalone mode, not just Safari in-browser. These two environments behave differently.
- Display a visual "Recording..." indicator that proves the audio level is non-zero. Use `AudioContext` + `AnalyserNode` to show a simple waveform or level meter — this catches silent captures immediately.
- As of iOS 18+, behavior has improved, but test on iOS 16 and 17 as well given military field device diversity.

**Detection (warning signs):**
- Audio works in Safari but not after Add to Home Screen
- Blob size consistently 44 bytes
- Whisper returns empty or "Thank you."

**Phase:** Phase 1 (audio capture scaffold). Must be caught with a real-device test before any transcription work begins.

---

### Pitfall 3: MediaRecorder Chunk Concatenation — Only First Blob is Decodable

**What goes wrong:** If `timeslice` is passed to `MediaRecorder.start(timeslice)` to stream chunks, each `ondataavailable` event emits a chunk. A very common mistake is treating each chunk as an independently decodable audio file and sending it to Whisper separately. Only the first chunk contains the container headers (WebM EBML header, codec private data). All subsequent chunks are raw codec data with no headers — they are not valid audio files and Whisper will reject or misparse them.

**Why it happens:** The WebM container is a streaming format. The header metadata lives at the start of the stream. Chunks after the first are deltas within that stream. This is correct per spec (MDN: "individual blobs are not individually decodable in general").

**Consequences:** Sending chunk 2+ to Whisper produces garbled output, errors, or empty transcripts.

**Prevention:**
- For PTT-style recording (press, speak, release), do NOT use `timeslice`. Call `recorder.start()` with no argument, collect all chunks via `ondataavailable` into an array, then on `onstop` create a single Blob:
  ```javascript
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: recorder.mimeType });
    // submit blob to transcription
  };
  ```
- If streaming is ever needed (long recordings), concatenate ALL chunks into one Blob before sending to Whisper, never individual chunks.

**Detection (warning signs):**
- Transcription works for short recordings, fails for long ones that crossed a chunk boundary
- Whisper returns error "invalid file format" on some recordings
- `timeslice` appears in recording code

**Phase:** Phase 1 (audio capture). Must be in the initial implementation, not discovered later.

---

### Pitfall 4: MIME Type Mismatch Between iOS Safari and Whisper API

**What goes wrong:** Chrome/Firefox/Android produce `audio/webm; codecs=opus`. iOS Safari (even post-Safari 18 WebM support) produces `audio/mp4` (AAC in MP4 container) in older iOS versions, and the mimeType negotiation differs. If the code hardcodes `audio/webm` or sets a fixed file extension (`.webm`) on the Blob before sending to Whisper, the API may misidentify the format.

**Why it happens:** `MediaRecorder.isTypeSupported('audio/webm;codecs=opus')` now returns true in Safari 18.4+, but on iOS 16/17 this returns false. Whisper uses the file extension (passed as the filename in the FormData) to detect format — not MIME type.

**Consequences:** Whisper returns 400 "Invalid file format" or misidentifies the codec and produces garbage output.

**Prevention:**
- Always check the actual MIME type at runtime:
  ```javascript
  const mimeType = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ].find(MediaRecorder.isTypeSupported) || 'audio/webm';
  ```
- Map mimeType to file extension when constructing FormData:
  ```javascript
  const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';
  formData.append('file', blob, `recording.${ext}`);
  ```
- Whisper supports: `m4a, mp3, webm, mp4, mpga, wav, mpeg`. All common mobile formats are covered if the extension is correct.

**Detection (warning signs):**
- Works on Android/desktop, fails on iOS
- Whisper returns 400 errors only from Safari
- Code contains hardcoded `'audio/webm'` string

**Phase:** Phase 1 (audio capture + transcription wiring).

---

## Moderate Pitfalls

Mistakes that cause delays, broken UX, or degraded transcription quality.

---

### Pitfall 5: Vercel Function Timeout on Hobby Plan (10s Default)

**What goes wrong:** Whisper API transcription of a 20-30 second audio file typically takes 3-8 seconds of OpenAI processing time. Add network latency for upload and response, and a Vercel Hobby plan function (10-second timeout) will intermittently time out under load or on large recordings.

**Why it happens:** Serverless function timeout on Hobby = 10s. Pro plan = 60s. Fluid Compute can extend this further but requires configuration.

**Consequences:** Intermittent 504 errors. Users see the request hang, then fail. Particularly bad during demo or training use.

**Prevention:**
- Target Pro plan for deployment, which gives 60s timeout — sufficient for all realistic PTT durations.
- Set `maxDuration` explicitly in `vercel.json` for the transcription function.
- Cap max recording time client-side (e.g., 30 seconds for RT training) to bound worst-case transcription latency.
- Add client-side timeout with user feedback ("Taking longer than usual...") at 8s.

**Detection (warning signs):**
- Transcription fails intermittently for longer recordings
- 504 errors in Vercel function logs
- Works consistently for recordings under 10 seconds

**Phase:** Phase 2 (deployment). Must be configured before user testing.

---

### Pitfall 6: AudioContext Suspended on Mobile — No Audio Playback After Transcription

**What goes wrong:** If the app attempts to play back audio (e.g., playing a correct example, or text-to-speech feedback) before a user gesture has interacted with an `AudioContext`, browsers silently block playback. Chrome and Safari both auto-suspend `AudioContext` created on page load.

**Why it happens:** Browser autoplay policies require audio to be initiated from within a user gesture handler (touchstart, click, etc.). Creating `AudioContext` on module load or app init puts it in `suspended` state.

**Consequences:** Audio playback silently fails. No error is thrown in many cases — the audio just never plays.

**Prevention:**
- Create `AudioContext` lazily, inside the first PTT `touchstart` handler.
- If created early, call `audioContext.resume()` explicitly inside any user gesture handler before playing.
- Test this specifically: load the PWA fresh, tap the PTT button as the first action, verify audio plays.

**Detection (warning signs):**
- Audio playback works in desktop dev tools, fails on first mobile load
- `audioContext.state === 'suspended'` after page load

**Phase:** Phase 2 (audio feedback/playback features).

---

### Pitfall 7: Service Worker Caching Intercepts the Transcription API Route

**What goes wrong:** An overly broad service worker cache strategy (e.g., `NetworkFirst` applied to all routes, or accidentally caching POST requests) can intercept the transcription API call. POSTs to `/api/transcribe` may be cached, returning stale responses, or the service worker may fail to pass the request body through correctly.

**Why it happens:** Workbox and most SW templates apply catch-all strategies. Developers configure caching for static assets but accidentally include API routes. Service workers intercept all fetch events including POST requests unless explicitly excluded.

**Consequences:** User submits a recording, gets a previous transcript back. Or the upload silently fails. Very hard to debug because it works without the SW installed.

**Prevention:**
- Explicitly exclude all `/api/*` routes from service worker caching. Use a `NavigationRoute` or a `registerRoute` matcher that returns `false` for non-GET requests and API paths.
- Never cache POST requests in a PWA unless you have explicit offline-queue logic (and that is a separate, complex feature).
- Use `self.__WB_MANIFEST` (Workbox precache) only for static shell assets.

**Detection (warning signs):**
- Transcription works in incognito (no SW) but returns stale data in normal mode
- Old transcriptions appear after re-recording
- Network tab shows "(ServiceWorker)" next to API calls

**Phase:** Phase 3 (PWA/offline hardening). Review SW scope configuration before any release.

---

### Pitfall 8: PTT Button Touchcancel Loses Recording on Mobile

**What goes wrong:** The PTT button listens to `touchstart` (begin recording) and `touchend` (stop and transcribe). If the user's finger moves slightly or the browser triggers `touchcancel` (e.g., due to a scroll gesture, incoming call, notification, or multi-touch), `touchend` never fires. Recording runs indefinitely, or the stop handler is never called.

**Why it happens:** Mobile browsers fire `touchcancel` for many reasons outside the developer's control: finger moved off element, system interruption, another touch began. If only `touchend` is handled, cancellations are missed.

**Consequences:** Recording never stops. Memory grows. If the user taps again, a second recorder starts or an error is thrown. The transcription is never submitted.

**Prevention:**
- Handle both `touchend` AND `touchcancel` to stop the recorder:
  ```javascript
  button.addEventListener('touchend', stopAndTranscribe);
  button.addEventListener('touchcancel', stopAndDiscard); // or stopAndTranscribe
  ```
- Use `pointerup` and `pointercancel` (Pointer Events API) instead, which unifies touch and mouse and includes cancel handling.
- Set a maximum recording time (e.g., 30s) with a client-side timer as a safety net that stops recording regardless.
- Add visual feedback (button state, timer) so users know recording is active.

**Detection (warning signs):**
- Recording appears to start but never produces a transcript
- Multiple recordings accumulate in memory
- Happens when user moves finger slightly before releasing

**Phase:** Phase 1 (PTT interaction design). Must be in the initial implementation.

---

### Pitfall 9: Whisper Misreads Military Abbreviations and NATO Phonetics

**What goes wrong:** Whisper was trained on general speech. Military RT vocabulary — callsigns (SUNRAY, NINER, BRAVO ZERO), NATO phonetics ("Alpha", "Bravo", etc.), NATO reporting terminology ("SITREP", "CASEVAC", "Grid"), and numeric formats ("two four seven zero") — is frequently transcribed incorrectly. "SUNRAY" becomes "Sun Ray" or "Sunday". Grid references get truncated. Procedure words get omitted.

**Why it happens:** Whisper uses a `prompt` parameter for context injection but it is not a reliable grammar constraint — it steers style, not hard-corrects vocabulary. Short prompts have less steering effect than long ones.

**Consequences:** The transcription comparison logic (correct vs. student output) produces false negatives. Students are penalised for correct transmissions because the ASR mangled the expected terminology.

**Prevention:**
- Pass a rich `prompt` to Whisper containing relevant vocabulary, formatted as it should appear: `"SUNRAY, NINER, CALLSIGN, SITREP, CASEVAC, GRID, ROGER, WILCO, OUT, OVER, WAIT OUT"`
- Post-process Whisper output with a domain-specific normalisation pass: regex replacements for common misreadings (e.g., "sunday" → "SUNRAY", "nine" → "NINER" in specific contexts).
- Consider `language: 'en'` explicitly in the API call to prevent Whisper trying other languages on accented military speech.
- Evaluate whether the scoring logic should use fuzzy matching (Levenshtein distance) rather than exact string comparison.

**Detection (warning signs):**
- Correct student transmissions score as failures
- Known callsigns or procedure words consistently wrong in output
- Numbers transcribed as words or incorrectly punctuated

**Phase:** Phase 2 (scoring/evaluation logic). Design the normalisation layer before building the scoring engine.

---

### Pitfall 10: iOS Screen-Off / Background Tab Kills MediaRecorder Mid-Recording

**What goes wrong:** On iOS, if the device screen turns off or the user switches apps while a recording is in progress, the browser suspends or terminates the active media stream. The `MediaRecorder` may silently stop emitting data, or fire `onstop` with whatever was captured so far, or produce a zero-byte blob.

**Why it happens:** iOS aggressively suspends background web processes as a privacy and battery measure. There is a WebKit bug open for this (bugs.webkit.org #198277). Unlike native apps, PWA background media access is severely restricted.

**Consequences:** Partial recordings are submitted to Whisper. The student's transmission is cut off. The scoring logic fails or scores an incomplete transmission.

**Prevention:**
- Use the `Page Visibility API` to detect when the page becomes hidden. If recording is active, stop and discard gracefully:
  ```javascript
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && recorder?.state === 'recording') {
      recorder.stop(); // triggers onstop with partial data
      showToast('Recording interrupted — please retry');
    }
  });
  ```
- Show a "Keep screen on" prompt using `WakeLock API` (supported in modern iOS/Android) to prevent accidental screen-off during training sessions.
- Set `blob.size` minimum threshold — discard and re-prompt if below 3-4 KB.

**Detection (warning signs):**
- Transcription failures correlate with device idle time
- Recordings from some users consistently incomplete
- Fails more on iOS than Android

**Phase:** Phase 2 (resilience hardening). Add after core recording works.

---

## Minor Pitfalls

Mistakes that cause annoyance or UX friction but are easily fixable.

---

### Pitfall 11: Permission Denial With No Recovery Path

**What goes wrong:** User denies microphone permission. The app has no explanation or recovery flow. The browser's "blocked" permission state persists across sessions and cannot be re-triggered by the app — only manually cleared in browser settings.

**Prevention:**
- Before calling `getUserMedia`, show a modal explaining why mic access is needed (military training requires it).
- After denial, show exact instructions for re-enabling: Settings > [Browser] > Microphone, with OS-specific screenshots.
- Cache permission state in localStorage to detect repeat visits where permission was previously denied.

**Phase:** Phase 1 (first launch flow).

---

### Pitfall 12: PWA Install Banner Not Triggered, Users Stay in Browser Tab

**What goes wrong:** The Web App Manifest is present but the PWA install prompt (`beforeinstallprompt`) never fires because requirements are not met. Common causes: missing `start_url`, incorrect `display: standalone`, service worker not registered on first load, or HTTPS not enforced.

**Prevention:**
- Test against Chrome's PWA installability checklist in DevTools (Application > Manifest).
- `display: standalone` is required. `start_url` must be within scope of the manifest.
- Vercel provides HTTPS automatically — confirm it is not being bypassed in dev.
- Show a manual "Add to Home Screen" prompt for iOS (which never fires `beforeinstallprompt`).

**Phase:** Phase 3 (PWA configuration).

---

### Pitfall 13: MediaRecorder `start()` Called Without Checking `getUserMedia` State

**What goes wrong:** The recording function calls `recorder.start()` but the microphone stream was already stopped (e.g., by a previous permission revocation, page navigation, or error). This throws `InvalidStateError` and breaks the PTT flow.

**Prevention:**
- Check `stream.active` before starting a new recording. If inactive, re-acquire the stream via `getUserMedia`.
- Wrap `recorder.start()` in try/catch and surface the error to the user.

**Phase:** Phase 1 (audio capture).

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Audio capture scaffold | Blob chunk concatenation (Pitfall 3), iOS standalone empty audio (Pitfall 2) | Real-device test on iOS in standalone mode from day one |
| PTT interaction | touchcancel not handled (Pitfall 8), AudioContext suspended (Pitfall 6) | Use Pointer Events; create AudioContext lazily in gesture handler |
| Transcription API route | Vercel 4.5 MB body limit (Pitfall 1), MIME type mismatch (Pitfall 4) | Detect MIME at runtime; decide upload architecture before coding |
| Scoring/evaluation | Military vocabulary mis-transcription (Pitfall 9) | Build normalisation layer before scoring logic |
| PWA/service worker | SW caching API routes (Pitfall 7), install prompt not firing (Pitfall 12) | Explicit SW exclusion for `/api/*`; check installability checklist |
| Deployment | Vercel function timeout (Pitfall 5) | Pro plan + explicit `maxDuration` in `vercel.json` |
| Resilience | Background tab kills recording (Pitfall 10), permission denial (Pitfall 11) | WakeLock API; permission denial recovery flow |

---

## Sources

- [Vercel Functions Limitations — official docs](https://vercel.com/docs/functions/limitations)
- [How to bypass Vercel 4.5 MB body limit — Vercel KB](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions)
- [Vercel function timeout KB](https://vercel.com/kb/guide/what-can-i-do-about-vercel-serverless-functions-timing-out)
- [MDN: MediaRecorder.dataavailable event](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/dataavailable_event)
- [MDN: Web Audio API best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices)
- [WebKit bug #185448 — getUserMedia not working in standalone PWA](https://bugs.webkit.org/show_bug.cgi?id=185448)
- [WebKit bug #198277 — Audio stops in background standalone web app](https://bugs.webkit.org/show_bug.cgi?id=198277)
- [iOS Safari MediaRecorder + Whisper implementation guide](https://www.buildwithmatija.com/blog/iphone-safari-mediarecorder-audio-recording-transcription)
- [MediaRecorder chunk audio corruption — RecordRTC issue](https://github.com/muaz-khan/RecordRTC/issues/539)
- [Whisper prompting guide — OpenAI cookbook](https://developers.openai.com/cookbook/examples/whisper_prompting_guide)
- [Whisper API file size limits — community discussion](https://community.openai.com/t/whisper-api-limits-transcriptions/167507)
- [MediaRecorder API with Whisper on mobile browsers — community](https://community.openai.com/t/mediarecorder-api-w-whisper-not-working-on-mobile-browsers/866019)
- [PWA iOS limitations guide 2026](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
- [MDN: PWA Caching guide](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Caching)
- [Chrome autoplay policy — Chrome for Developers](https://developer.chrome.com/blog/autoplay)
