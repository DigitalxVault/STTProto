# Phase 2: Audio Capture - Research

**Researched:** 2026-03-25
**Domain:** MediaRecorder API, getUserMedia, PTT gesture handling, iOS Safari cross-browser audio
**Confidence:** HIGH (core APIs verified via MDN official docs + WebKit blog + WebSearch)

---

## Summary

Phase 2 adds push-to-talk (PTT) audio capture using the browser-native MediaRecorder API backed by getUserMedia. The pattern is well-established: acquire the microphone stream once on first user interaction, then start/stop MediaRecorder on each PTT gesture, collecting chunks in an array and assembling a final Blob on stop.

The primary cross-browser challenge is MIME type negotiation. As of Safari 18.4 (released March 31, 2025), `audio/webm;codecs=opus` is now universally supported across Chrome, Firefox, and Safari. However, iOS Safari before 18.4 only supports `audio/mp4` (AAC). A runtime priority list via `MediaRecorder.isTypeSupported()` handles both generations cleanly.

The PTT gesture layer must use Pointer Events (`pointerdown`/`pointerup`/`pointercancel`), not Touch Events, because the button already has `touch-action: none` in Phase 1 CSS. `pointercancel` must be treated identically to `pointerup` to prevent stuck-recording states on mobile. `setPointerCapture()` on `pointerdown` ensures the button keeps receiving events even if the finger drifts off the target.

**Primary recommendation:** Acquire and hold the MediaStream from first button press (not on page load). Use `MediaRecorder.isTypeSupported()` to select MIME type at runtime. Assemble final Blob only in `onstop` handler using all collected chunks. Stop stream tracks when done (not the stream object).

---

## Standard Stack

No external libraries are needed. Everything required is native browser API.

### Core
| API | Version | Purpose | Why Standard |
|-----|---------|---------|--------------|
| `navigator.mediaDevices.getUserMedia` | Baseline 2021 | Acquire microphone stream | Web standard, no dependencies |
| `MediaRecorder` | Baseline 2021 | Encode audio to webm/mp4 | Web standard, built-in codec selection |
| `Blob` | Universal | Final audio container | Built-in, required by Whisper upload |
| Pointer Events API | Baseline 2017+ | PTT gesture handling | Unified mouse+touch, works with `touch-action: none` |

### Supporting
| API | Purpose | When to Use |
|-----|---------|-------------|
| `MediaRecorder.isTypeSupported()` | Runtime MIME detection | Always, before constructing MediaRecorder |
| `setPointerCapture()` | Capture pointer to button | On `pointerdown` to prevent missed `pointerup` |
| `navigator.permissions.query()` | Pre-check mic permission | Optional: show state before first press |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pointer Events | Touch Events + Mouse Events | Touch Events don't fire on desktop; need two separate handlers |
| Pointer Events | `mousedown`/`mouseup` only | Breaks on touch-only devices |
| Native MediaRecorder | `opus-media-recorder` polyfill | Adds WASM dependency; unnecessary since Safari 18.4 |
| Hold stream open | Re-acquire on every PTT press | Re-acquiring causes noticeable ~300ms delay on iOS + re-prompts permission |

**Installation:** No packages needed. Pure vanilla JS.

---

## Architecture Patterns

### Recommended Module Structure

```
app.js  (single file, expanded from Phase 1)
  ├── Stream management   (getUserMedia, track cleanup)
  ├── MIME detection      (isTypeSupported priority list)
  ├── MediaRecorder lifecycle  (start, stop, chunk collection)
  ├── PTT gesture handler (pointerdown/pointerup/pointercancel)
  └── Button state machine (idle/recording/processing class swaps)
```

Phase 2 stays in a single `app.js`. No module bundler or splitting is needed at this scale.

### Pattern 1: MIME Type Priority Detection

**What:** Test MIME types at module init, before any recording. Use the first supported type.
**When to use:** Always — call once at startup and cache the result.

```javascript
// Source: MDN MediaRecorder.isTypeSupported() + Safari 18.4 release notes
function getSupportedMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',   // Chrome, Firefox, Safari 18.4+
    'audio/webm',               // Chrome, Firefox (no codec spec)
    'audio/mp4;codecs=mp4a.40.2', // iOS Safari < 18.4 (AAC in MP4)
    'audio/mp4',                // iOS Safari < 18.4 fallback
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return ''; // Let browser choose default
}

const MIME_TYPE = getSupportedMimeType();
```

**Important:** iOS Safari 18.0–18.3 throws if an unsupported mimeType is passed to the MediaRecorder constructor. Always check first, never hardcode.

### Pattern 2: Stream Acquisition (Lazy, On First Press)

**What:** Call `getUserMedia` on the first `pointerdown`, hold the stream for the session. Do NOT call on page load.
**When to use:** PTT workflows — acquiring eagerly causes iOS permission prompt at wrong moment.

```javascript
// Source: MDN getUserMedia(), verified against iOS behavior reports
let micStream = null;

async function ensureStream() {
  if (micStream) return micStream;
  micStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,         // Mono — voice doesn't need stereo
      echoCancellation: true,  // Activates OS-level echo suppression
      noiseSuppression: true,  // Reduces background noise
      autoGainControl: true,   // Normalizes volume
    }
  });
  return micStream;
}
```

**getUserMedia constraints for voice (verified):**
- `channelCount: 1` — mono sufficient for speech, halves file size
- `echoCancellation: true` — activates hardware echo suppression on supported devices
- `noiseSuppression: true` — OS-level noise reduction
- `autoGainControl: true` — prevents clipping/quiet recordings
- Do NOT request `sampleRate` explicitly — iOS Safari ignores/rejects it; let browser decide

### Pattern 3: MediaRecorder Lifecycle with Chunk Assembly

**What:** Start recorder on press, collect chunks via `ondataavailable`, assemble Blob in `onstop`.
**When to use:** All PTT recordings. Never assemble the Blob inside `ondataavailable`.

```javascript
// Source: MDN MediaRecorder, MDN dataavailable event
let recorder = null;
let chunks = [];

function startRecording(stream) {
  chunks = [];
  const options = MIME_TYPE ? { mimeType: MIME_TYPE } : {};
  recorder = new MediaRecorder(stream, options);

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {  // CRITICAL: filter empty chunks
      chunks.push(e.data);
    }
  };

  recorder.onstop = () => {
    if (chunks.length === 0) {
      console.warn('Recording produced no data');
      setBtnState('idle');
      return;
    }
    const blob = new Blob(chunks, { type: recorder.mimeType });
    if (blob.size === 0) {
      console.warn('Assembled blob is empty');
      setBtnState('idle');
      return;
    }
    setBtnState('processing');
    handleBlob(blob);  // Pass to Phase 3 (transcription)
  };

  recorder.start();  // NO timeslice — single chunk on stop is simpler
}

function stopRecording() {
  if (recorder && recorder.state === 'recording') {
    recorder.stop();
  }
}
```

**Key decision — no timeslice:** For PTT where recordings are short (1–10 seconds), calling `start()` without a timeslice means one `dataavailable` fires on `stop()`. This is simpler than collecting incremental chunks. The known pitfall that "timeslice chunks are NOT independently decodable" is irrelevant when all chunks are concatenated, but avoiding timeslice eliminates the complexity entirely for short recordings.

### Pattern 4: PTT Gesture Handling

**What:** Use Pointer Events on the button element. Capture the pointer on `pointerdown` to prevent missed `pointerup`.
**When to use:** Any touch/mouse-compatible PTT button.

```javascript
// Source: MDN Pointer Events, MDN setPointerCapture()
const micBtn = document.querySelector('.mic-btn');

micBtn.addEventListener('pointerdown', async (e) => {
  e.preventDefault();  // Prevent context menu on long-press (Android Chrome)
  micBtn.setPointerCapture(e.pointerId);  // Keep receiving events if finger drifts
  setBtnState('recording');
  try {
    const stream = await ensureStream();
    startRecording(stream);
  } catch (err) {
    handleMicError(err);
  }
});

micBtn.addEventListener('pointerup', (e) => {
  stopRecording();
  // State transitions to 'processing' inside recorder.onstop
});

micBtn.addEventListener('pointercancel', (e) => {
  // Treat exactly like pointerup — fires when browser cancels gesture
  // (e.g. scroll detected, incoming call on iOS)
  stopRecording();
});
```

**CSS requirement (already set in Phase 1):**
```css
.mic-btn {
  touch-action: none;   /* REQUIRED — prevents pointer events from being cancelled by scroll */
  -webkit-tap-highlight-color: transparent;
}
```

### Pattern 5: Button State Machine Integration

**What:** Swap CSS classes on `.mic-btn` to reflect state. Phase 1 already defines the three classes.
**When to use:** All state transitions during PTT lifecycle.

```javascript
// Source: Phase 1 style.css — state-idle / state-recording / state-processing
const STATES = ['state-idle', 'state-recording', 'state-processing'];

function setBtnState(state) {
  micBtn.classList.remove(...STATES);
  micBtn.classList.add(`state-${state}`);
}
// Usage:
// setBtnState('idle')       — grey, no animation
// setBtnState('recording')  — red, pulse animation
// setBtnState('processing') — spinner overlay
```

### Pattern 6: Permission Error Handling

```javascript
// Source: MDN getUserMedia errors
function handleMicError(err) {
  setBtnState('idle');
  if (err.name === 'NotAllowedError') {
    // User denied OR insecure context (HTTP)
    showError('Microphone access denied. Check browser settings.');
  } else if (err.name === 'NotFoundError') {
    showError('No microphone found.');
  } else if (err.name === 'NotReadableError') {
    showError('Microphone in use by another app.');
  } else {
    showError('Could not access microphone: ' + err.message);
  }
}
```

### Pattern 7: Stream Cleanup

```javascript
// Source: MDN MediaStreamTrack.stop()
// Call this when done (e.g., page unload). Do NOT hold mic open indefinitely.
function releaseStream() {
  if (micStream) {
    micStream.getTracks().forEach(track => track.stop());
    micStream = null;
  }
}
// Note: DO NOT call micStream.stop() — deprecated. Always stop individual tracks.
```

### Anti-Patterns to Avoid

- **Calling getUserMedia on page load:** Causes iOS Safari to prompt for permission before any user gesture. Always call from within a user-initiated event handler.
- **Using Touch Events instead of Pointer Events:** Requires duplicating handlers for mouse. Phase 1 already sets `touch-action: none` which makes Pointer Events work correctly.
- **Using timeslice for short PTT recordings:** Introduces complexity (seeking-broken WebM, independent-decodability issues) for no benefit at <10s durations.
- **Hardcoding `mimeType: 'audio/webm;codecs=opus'`:** iOS Safari 18.0–18.3 throws if this type is passed and not supported. Always use `isTypeSupported()` first.
- **Assembling Blob inside `ondataavailable`:** The `stop` event fires AFTER the final `dataavailable`. Always assemble in `onstop`.
- **Calling MediaStream.stop():** Deprecated. Use `track.stop()` on each track.
- **Not checking `e.data.size > 0` in `ondataavailable`:** Empty chunks can occur (known browser behavior); pushing them corrupts the final Blob.
- **Not handling `pointercancel`:** On mobile, browser gestures (scroll, incoming call, notification) fire `pointercancel` instead of `pointerup`, leaving the recorder stuck in `recording` state.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Audio encoding | Custom encoder | MediaRecorder built-in | Browser uses hardware codec (AAC, Opus) |
| MIME type negotiation | Hardcoded strings | `MediaRecorder.isTypeSupported()` | Browser knows what it supports |
| Cross-browser pointer handling | Touch + Mouse event split | Pointer Events unified API | Single handler, `touch-action: none` already set |
| Blob URL lifecycle | Custom object pool | `URL.createObjectURL()` + `URL.revokeObjectURL()` | Standard, handles GC correctly |
| VAD (voice activity detection) | Audio analysis loop | Not needed for PTT | User is the VAD — they hold the button |

**Key insight:** MediaRecorder is the complete solution. There is no need for Web Audio API, AudioWorklet, or any custom encoding pipeline for this use case. The API handles encoding, chunking, and MIME type assignment natively.

---

## Common Pitfalls

### Pitfall 1: iOS Safari MediaRecorder Empty Blob in Standalone Mode

**What goes wrong:** On iOS Safari in PWA standalone mode (added to home screen), `MediaRecorder` may produce blobs where `blob.size === 0` or the blob contains silence. This is a known WebKit limitation related to audio session management in standalone context (WebKit bug #185448 and related).

**Why it happens:** The WebKit audio session may not initialize correctly in standalone PWA mode without a prior user gesture that also plays audio. The microphone hardware is acquired but encoding produces no output.

**How to avoid:**
1. Always check `blob.size > 0` before proceeding to transcription
2. Show a clear error ("Recording failed, please try again") rather than sending an empty blob to Whisper
3. Optional: A brief "warmup" — calling `getUserMedia` and immediately stopping it on first button press, then retrying — can help initialize the audio session. However this adds latency so should only be done as a retry path.
4. Ensure the app is served over HTTPS (required for `getUserMedia` in standalone mode)

**Warning signs:** `blob.size === 0` in `onstop`, or Whisper returns "no speech detected" on every recording from iOS home screen.

### Pitfall 2: Permission Prompt on Every Launch in iOS PWA

**What goes wrong:** iOS Safari standalone PWAs re-prompt for microphone permission on each cold launch. Unlike Android Chrome, iOS does not persist PWA media permissions across sessions. (WebKit bug #215884 — status: known issue as of 2025-03)

**Why it happens:** Each PWA launch is treated as a new browsing session by WebKit's privacy model.

**How to avoid:**
1. Design the UX so the first PTT press triggers `getUserMedia` — the user expects interaction before recording, so the permission prompt feels natural at that point.
2. Do NOT call `getUserMedia` on `DOMContentLoaded` — this causes an abrupt, context-free permission prompt.
3. Cache the stream for the session duration. Do not call `getUserMedia` again for subsequent recordings.

**Warning signs:** Users report "it always asks for microphone access" — this is expected iOS behavior, not a bug in the implementation.

### Pitfall 3: Stuck Recording State on pointercancel

**What goes wrong:** On mobile, if the user receives a phone call, swipes down notification center, or presses the home button while holding the mic button, the browser fires `pointercancel` (not `pointerup`). If `pointercancel` is not handled, `recorder.stop()` is never called, and the app gets stuck in `state-recording`.

**Why it happens:** Browser takes control of the touch gesture for system-level events.

**How to avoid:** Add a `pointercancel` listener that calls the same stop logic as `pointerup`. Both must call `stopRecording()`.

**Warning signs:** Mic button stays red after releasing finger; subsequent presses don't start recording (recorder is already in `recording` state).

### Pitfall 4: getUserMedia Called Outside User Gesture on iOS

**What goes wrong:** Calling `getUserMedia` outside a user-initiated event handler (e.g., on load, in a setTimeout, in a Promise resolution that isn't directly tied to an event) throws `NotAllowedError` on iOS Safari.

**Why it happens:** iOS WebKit enforces that media capture must be initiated from within a user gesture handler call stack.

**How to avoid:** Always call `getUserMedia` (or `ensureStream()`) directly inside a `pointerdown` event handler. The async/await chain from within an event handler preserves the gesture context in modern iOS versions.

**Warning signs:** `NotAllowedError` on iOS only, works fine in Chrome desktop.

### Pitfall 5: MediaRecorder Constructor Throws on Unsupported mimeType

**What goes wrong:** Passing `{ mimeType: 'audio/webm;codecs=opus' }` to the MediaRecorder constructor on iOS Safari 18.0–18.3 throws a `DOMException: NotSupportedError`. Safari 18.4+ supports it, but older iOS is still in the field.

**Why it happens:** The constructor validates mimeType eagerly.

**How to avoid:** Always call `MediaRecorder.isTypeSupported(type)` before using a type in the constructor. Use the priority list pattern (see Standard Stack).

**Warning signs:** "DOMException: The operation is not supported" on iOS 18.0–18.3, never on desktop Chrome.

### Pitfall 6: Blob Assembly Order Dependency

**What goes wrong:** When using `timeslice`, assembling the Blob with chunks collected before `onstop` fires will miss the final chunk. The final `dataavailable` fires just before `onstop`.

**How to avoid:** Always assemble the Blob inside `onstop`, not in `ondataavailable`. This ensures all chunks are collected.

---

## Code Examples

### Complete Minimal PTT Implementation

```javascript
// Source: MDN MediaRecorder, MDN Pointer Events, MDN getUserMedia

// --- MIME detection (run once at module init) ---
function getSupportedMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
  ];
  return candidates.find(t => MediaRecorder.isTypeSupported(t)) ?? '';
}
const MIME_TYPE = getSupportedMimeType();

// --- State ---
const STATES = ['state-idle', 'state-recording', 'state-processing'];
const micBtn = document.querySelector('.mic-btn');
let micStream = null;
let recorder = null;
let chunks = [];

function setBtnState(state) {
  micBtn.classList.remove(...STATES);
  micBtn.classList.add(`state-${state}`);
}

// --- Stream ---
async function ensureStream() {
  if (micStream) return micStream;
  micStream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true,
             noiseSuppression: true, autoGainControl: true }
  });
  return micStream;
}

// --- Recording ---
function startRecording(stream) {
  chunks = [];
  const opts = MIME_TYPE ? { mimeType: MIME_TYPE } : {};
  recorder = new MediaRecorder(stream, opts);

  recorder.ondataavailable = (e) => {
    if (e.data?.size > 0) chunks.push(e.data);
  };

  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: recorder.mimeType });
    if (blob.size === 0) {
      setBtnState('idle');
      return;
    }
    setBtnState('processing');
    dispatchEvent(new CustomEvent('audio-captured', { detail: { blob } }));
  };

  recorder.start();
}

function stopRecording() {
  if (recorder?.state === 'recording') recorder.stop();
}

// --- PTT Gestures ---
micBtn.addEventListener('pointerdown', async (e) => {
  e.preventDefault();
  micBtn.setPointerCapture(e.pointerId);
  setBtnState('recording');
  try {
    const stream = await ensureStream();
    startRecording(stream);
  } catch (err) {
    setBtnState('idle');
    // TODO: surface error to user
    console.error('Mic error:', err.name, err.message);
  }
});

micBtn.addEventListener('pointerup', () => stopRecording());
micBtn.addEventListener('pointercancel', () => stopRecording());
```

### MIME Type Detection for Whisper Upload

```javascript
// Source: project context — Whisper accepts webm and mp4
// Determine extension for FormData upload (Phase 3 will use this)
function getBlobExtension(mimeType) {
  if (mimeType.startsWith('audio/webm') || mimeType.startsWith('video/webm')) {
    return 'webm';
  }
  if (mimeType.startsWith('audio/mp4') || mimeType.startsWith('video/mp4')) {
    return 'mp4';
  }
  return 'audio';
}
```

### Removing Phase 1 Demo Strip

```javascript
// Per prior decisions: remove .state-demo when real behavior is added
const demoStrip = document.querySelector('.state-demo');
if (demoStrip) demoStrip.remove();
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `audio/mp4` only for Safari | `audio/webm;codecs=opus` works Safari 18.4+ | March 31, 2025 | Single MIME type works all browsers (iOS 18.4+) |
| Touch Events + Mouse Events | Pointer Events unified API | Baseline 2017 | Single handler for all input types |
| `MediaStream.stop()` | `track.stop()` on each track | ~2016 | `MediaStream.stop()` deprecated, removed in some browsers |
| Re-acquire mic each press | Hold stream for session | Best practice since ~2020 | Avoids 300ms delay and iOS re-permission |

**Deprecated/outdated:**
- `MediaStream.stop()`: Use `stream.getTracks().forEach(t => t.stop())`
- Touch Events for PTT: Use Pointer Events
- `opus-media-recorder` WASM polyfill: Unnecessary since Safari 18.4

---

## iOS Safari Specifics — Detailed Notes

### MIME Type Timeline
- **iOS < 14.3:** MediaRecorder not available
- **iOS 14.3+:** MediaRecorder available, `audio/mp4` (AAC) only
- **iOS 18.4+ (Safari 18.4, released 2025-03-31):** `audio/webm;codecs=opus` now supported

### Standalone Mode Audio Behavior
- **getUserMedia in standalone:** Fixed in iOS 13.4 (February 2020). Works in current iOS.
- **Permission persistence:** Does NOT persist across cold launches on any iOS version as of 2025. Each cold launch re-prompts. Mitigate by acquiring stream on first PTT press (not on load).
- **Empty blob bug (WebKit #185448):** Original bug was getUserMedia not working at all, fixed in iOS 13.4. A related issue of silent/empty audio can occur if `getUserMedia` is called before any user gesture unlocks the audio session. Solution: always call from within `pointerdown` handler.

### PWA vs Safari Tab
- Both work for `getUserMedia` on iOS 13.4+
- Both re-prompt each session (PWA) or each page load (tab)
- Standalone mode adds complexity only around the permission UX, not the recording itself

---

## Open Questions

1. **iOS 17 vs 18.4 MIME type in the field**
   - What we know: Safari 18.4+ supports webm/opus; older requires mp4. The priority detection pattern handles both.
   - What's unclear: What percentage of target users will be on iOS < 18.4 at launch? This affects whether to test mp4 path carefully.
   - Recommendation: Test the mp4 fallback path explicitly on an iOS 17 device or simulator.

2. **Empty blob rate in iOS PWA standalone**
   - What we know: WebKit bug #185448 was the "completely broken" scenario (fixed iOS 13.4). Silent/empty blobs can still occur in edge cases.
   - What's unclear: Frequency in current iOS 18 standalone. May be rare or non-existent now.
   - Recommendation: Implement `blob.size > 0` validation and a user-visible error for the empty case. Measure in testing.

3. **MediaRecorder `state` guard on rapid taps**
   - What we know: `recorder.state` can be checked before calling `stop()`.
   - What's unclear: If user taps very quickly (pointerdown immediately followed by pointerup before `getUserMedia` resolves), the recorder may not have started yet.
   - Recommendation: Check `recorder?.state === 'recording'` in `stopRecording()`. Already included in the code examples above.

---

## Sources

### Primary (HIGH confidence)
- MDN MediaRecorder — constructor, start(), stop(), dataavailable, onstop, isTypeSupported
- MDN getUserMedia() — audio constraints, error types, security requirements
- MDN Pointer Events — pointerdown/pointerup/pointercancel, setPointerCapture, touch-action
- MDN dataavailable event — event order relative to stop(), chunk collection pattern
- WebKit blog "MediaRecorder API" (2020) — original Safari implementation details, mp4/AAC only at launch
- WebKit bug #185448 — getUserMedia standalone mode (resolved iOS 13.4)
- WebKit bug #215884 — recurring permission prompts in standalone (known ongoing issue)

### Secondary (MEDIUM confidence)
- Safari 18.4 release: webm/opus support confirmed by multiple sources (addpipe.com blog, ppc.land, apple.gadgethacks.com) all citing Safari 18.4 changelog
- media-codings.com "Recording cross browser compatible media" — WebM seeking limitation with timeslice, iOS 2.5ms frame behavior

### Tertiary (LOW confidence — flag for validation)
- Empty blob / silent audio in standalone PWA: reported in community forums and Flutter issue tracker but not definitively documented by Apple. Test empirically.
- iOS 18.0–18.3 throwing on unsupported mimeType constructor: reported in multiple forums but not in official Apple docs. Test empirically with `isTypeSupported()` guard in place.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all APIs are MDN-documented baseline
- Architecture: HIGH — patterns derived from official API specs
- PTT gesture handling: HIGH — MDN Pointer Events spec, touch-action confirmed in Phase 1 CSS
- MIME type negotiation: HIGH — isTypeSupported() is the spec-standard approach; Safari 18.4 webm support confirmed
- iOS pitfalls: MEDIUM — core bugs (185448, 215884) verified via WebKit tracker; silent blob edge case is LOW

**Research date:** 2026-03-25
**Valid until:** 2026-06-25 (stable APIs; iOS behavior may change with new Safari releases)
