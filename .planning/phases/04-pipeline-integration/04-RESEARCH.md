# Phase 4: Pipeline Integration - Research

**Researched:** 2026-03-25
**Domain:** Vanilla JS event handling, Fetch API, DOM mutation
**Confidence:** HIGH

---

## Summary

Phase 4 wires three already-built pieces together: the `audio-captured` CustomEvent
(Phase 2), the `/api/transcribe` POST endpoint (Phase 3), and the `.transcript-panel`
DOM node (Phase 1). All integration patterns are native browser APIs — no libraries
are needed or appropriate here.

The existing `app.js` almost does the right thing: `recorder.onstop` dispatches the
`audio-captured` event but then immediately calls `setState('idle')`. That one line
must move so that `processing` state persists until the API call resolves. Everything
else is additive: a new event listener, a fetch wrapper, and a DOM append helper.

**Primary recommendation:** Add a single `document.addEventListener('audio-captured', ...)`
listener in `app.js` (or a colocated module) that (1) sends the blob as FormData to
`/api/transcribe`, (2) manages the processing/idle state transition, and (3) appends
the returned text as a new `<p>` in `.transcript-panel`.

---

## Standard Stack

### Core
| API / Feature | Version | Purpose | Why Standard |
|---|---|---|---|
| `CustomEvent` / `addEventListener` | Browser-native | Event bus for `audio-captured` | Already used by Phase 2; bubbles to `document` |
| `fetch` + `FormData` | Browser-native | POST blob to `/api/transcribe` | Zero-dependency; `multipart/form-data` constructed automatically |
| `document.createElement` / `element.append` | Browser-native | DOM transcript entries | XSS-safe; preserves existing listeners |
| `element.scrollTop = element.scrollHeight` | Browser-native | Auto-scroll to latest entry | One-liner; synchronous after DOM mutation |

### No Libraries Needed
This phase is pure integration glue. No utility library, framework, or npm package
is warranted. The project already has zero client-side dependencies (vanilla JS).

---

## Architecture Patterns

### Recommended Module Boundary

All Phase 4 code belongs in `app.js` as a new section after the existing PTT handlers.
There is no reason to split into a separate file: the codebase is intentionally a single
script, and the state machine (`setState`) must remain accessible.

```
app.js
  ├── Service Worker registration (existing)
  ├── DOM references (existing — ADD transcriptPanel ref here)
  ├── State variables (existing)
  ├── setState() (existing)
  ├── Mic acquisition (existing)
  ├── MediaRecorder lifecycle (existing — MODIFY onstop)
  ├── PTT handlers (existing)
  ├── Pointer events (existing)
  ├── [NEW] transcribeAndDisplay() — async fetch wrapper
  ├── [NEW] addTranscriptEntry() — DOM mutation helper
  └── [NEW] audio-captured event listener
```

### Pattern 1: Fixing onstop — Move setState('idle') out

**Current (Phase 2):**
```javascript
// recorder.onstop in app.js, line 131
setState('idle');   // <-- this must move
```

**Phase 4 change:** Remove `setState('idle')` from `onstop`. The listener will call
`setState('processing')` — which `stopRecording()` already sets (line 147) — then
transition to `idle` after the API call completes. The fix is simply deleting one line:

```javascript
recorder.onstop = function () {
  const blobType = mimeType || 'audio/webm';
  const blob = new Blob(chunks, { type: blobType });

  if (blob.size === 0) {
    console.warn('[PTT] Audio blob is empty — recording may have been too short.');
    setState('idle');
    return;
  }

  micBtn.dispatchEvent(new CustomEvent('audio-captured', {
    bubbles: true,
    detail: { blob: blob },
  }));
  // setState('idle') is intentionally removed here.
  // The audio-captured listener manages the transition to idle.
};
```

**Why:** `stopRecording()` already calls `setState('processing')` at line 147 of the
current code. After dispatch, control passes to the listener which owns the
`processing → idle` transition.

### Pattern 2: Listening for audio-captured at document level

Because the event is dispatched on `micBtn` with `bubbles: true`, it reaches `document`:

```javascript
// Source: MDN EventTarget.addEventListener
document.addEventListener('audio-captured', function (e) {
  transcribeAndDisplay(e.detail.blob);
});
```

Listening on `document` (rather than `micBtn` directly) keeps the listener decoupled
from the button reference, which is consistent with how a real event bus works.

### Pattern 3: fetch with FormData — no Content-Type header

**Critical rule:** Do NOT set `Content-Type: multipart/form-data` manually. The browser
must set it with the generated `boundary` parameter. If you set it manually the server
receives a request with no boundary and cannot parse the fields.

```javascript
// Source: MDN Using FormData Objects
async function transcribeAndDisplay(blob) {
  const formData = new FormData();
  formData.append('file', blob, 'audio.webm');  // filename arg is optional but good practice

  let response;
  try {
    response = await fetch('/api/transcribe', {
      method: 'POST',
      body: formData,
      // NO headers object — let the browser set Content-Type + boundary
    });
  } catch (networkErr) {
    // fetch() only rejects on network failure (no connection, DNS, etc.)
    console.error('[STT] Network error:', networkErr);
    showError('NETWORK ERROR');
    setState('idle');
    return;
  }

  // fetch() resolves even for 4xx/5xx — must check response.ok
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    console.error('[STT] API error:', response.status, body.error);
    showError('TRANSCRIPTION FAILED');
    setState('idle');
    return;
  }

  const data = await response.json();
  addTranscriptEntry(data.text);
  setState('idle');
}
```

### Pattern 4: DOM transcript entry — createElement, not innerHTML

Use `createElement` + `textContent` for XSS safety. The transcription text comes from
an external API and must not be injected as raw HTML.

```javascript
// Source: MDN Node.textContent
const transcriptPanel = document.querySelector('.transcript-panel');

function addTranscriptEntry(text) {
  // Remove placeholder on first real entry
  const placeholder = transcriptPanel.querySelector('.transcript-placeholder');
  if (placeholder) placeholder.remove();

  const entry = document.createElement('p');
  entry.textContent = text;                // safe — no HTML injection
  entry.classList.add('transcript-entry'); // for future styling
  transcriptPanel.append(entry);

  // Auto-scroll to latest entry
  transcriptPanel.scrollTop = transcriptPanel.scrollHeight;
}
```

**Why not `innerHTML +=`?** Setting `innerHTML +=` re-parses and re-serialises the
entire panel on every entry, destroying any existing event listeners and slowing down
with each addition. `append()` is O(1) per entry.

**Why not `insertAdjacentHTML`?** For untrusted text from an API, `textContent` is
the only safe choice. `insertAdjacentHTML` is fine for trusted static markup but
must never receive API-returned strings.

### Pattern 5: Error display

The simplest approach that matches the existing aesthetic: temporarily override the
`statusIndicator` text (the existing `showStatusTemp` function already does this) and
also add a dim error entry to the transcript panel.

```javascript
function showError(label) {
  showStatusTemp(label, '#cc4444', 4000);
}
```

A transcript-panel error entry is optional for the MVP but recommended by the
requirement "failure shows a visible error state rather than silently swallowing
the recording." Adding a styled `<p class="transcript-error">` satisfies this cleanly
without new infrastructure.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| multipart form encoding | Custom boundary serialisation | `FormData` + `fetch` (no headers) | Browser handles boundary generation correctly |
| XSS sanitisation of transcript text | HTML-escape function | `element.textContent = text` | `textContent` assignment is inherently safe |
| Event bus / pub-sub | Custom observer | `CustomEvent` with `bubbles: true` | Already in use; zero overhead |
| Scroll-to-bottom detection | ResizeObserver / IntersectionObserver | `scrollTop = scrollHeight` | Panel is always short enough that smart-scroll is over-engineering |

**Key insight:** Every "hard" problem in this phase (form encoding, DOM safety,
event routing) already has a one-liner browser API solution. The planner should not
introduce any abstraction layers.

---

## Common Pitfalls

### Pitfall 1: Setting Content-Type manually on the fetch request

**What goes wrong:** The server receives `multipart/form-data` without a `boundary`
parameter and responds `400: Request must use multipart/form-data` even though you
sent FormData.

**Why it happens:** Setting `Content-Type` in `headers` overrides the browser's
auto-generated value (which includes the boundary token the parser needs).

**How to avoid:** Never include a `headers` property when `body` is a `FormData`.

**Warning signs:** 400 responses from `/api/transcribe` despite the request appearing
correct in DevTools Network tab (the Content-Type header will show no `boundary=`).

---

### Pitfall 2: setState('idle') left in recorder.onstop

**What goes wrong:** The `processing` spinner disappears immediately after release,
before the API call finishes, making the UI look broken (idle spinner during network
wait).

**Why it happens:** Phase 2's `onstop` transitions to `idle` right after dispatching
the event. The listener fires asynchronously but the state flip happens synchronously
first.

**How to avoid:** Delete the `setState('idle')` call on line 131 of `app.js` as part
of this phase. Ownership of the `processing → idle` transition moves to the listener.

**Warning signs:** The spinner never appears during the API call; the button
immediately returns to its grey idle state after release.

---

### Pitfall 3: fetch() promise rejection not distinguished from HTTP error

**What goes wrong:** A `try/catch` around `fetch` catches only network errors. HTTP
4xx/5xx responses resolve the promise with `ok: false` — they don't throw. If
`response.ok` is not checked, a 500 from the API is silently treated as success and
`data.text` will be `undefined`, appending "undefined" to the transcript.

**How to avoid:** Always check `response.ok` after `await fetch(...)`. Throw or handle
explicitly if false (see Pattern 3 above).

---

### Pitfall 4: innerHTML mutation destroys the placeholder reference

**What goes wrong:** Code uses `transcriptPanel.innerHTML += '<p>...'` to append
entries. This re-parses the whole panel and removes the `.transcript-placeholder`
node from the live DOM, but references to it become stale.

**How to avoid:** Use `createElement` + `append` (Pattern 4). Remove the placeholder
by querying for `.transcript-placeholder` on the first entry only.

---

### Pitfall 5: Appending the blob's MIME type as the filename

**What goes wrong:** `formData.append('file', blob)` without a filename argument
sends a filename of `"blob"` (Chrome/Firefox default). Some servers handle this fine;
others infer content type from filename extension. The Phase 3 proxy uses `file.type`
not the filename extension for MIME resolution, so this is low-risk but worth noting.

**How to avoid:** Always pass an explicit filename:
```javascript
formData.append('file', blob, 'audio.webm');
```

---

## Code Examples

### Complete transcribeAndDisplay function

```javascript
// Canonical implementation for Phase 4
const transcriptPanel = document.querySelector('.transcript-panel');

function addTranscriptEntry(text) {
  const placeholder = transcriptPanel.querySelector('.transcript-placeholder');
  if (placeholder) placeholder.remove();

  const entry = document.createElement('p');
  entry.textContent = text;
  entry.classList.add('transcript-entry');
  transcriptPanel.append(entry);
  transcriptPanel.scrollTop = transcriptPanel.scrollHeight;
}

async function transcribeAndDisplay(blob) {
  const formData = new FormData();
  formData.append('file', blob, 'audio.webm');

  let response;
  try {
    response = await fetch('/api/transcribe', { method: 'POST', body: formData });
  } catch (networkErr) {
    console.error('[STT] Network error:', networkErr);
    showStatusTemp('NETWORK ERROR', '#cc4444', 4000);
    setState('idle');
    return;
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    console.error('[STT] API error:', response.status, body.error);
    showStatusTemp('TRANSCRIPTION FAILED', '#cc4444', 4000);
    setState('idle');
    return;
  }

  const { text } = await response.json();
  if (text) {
    addTranscriptEntry(text);
  }
  setState('idle');
}

document.addEventListener('audio-captured', function (e) {
  transcribeAndDisplay(e.detail.blob);
});
```

### onstop change (single-line deletion)

Remove only the `setState('idle')` call at the bottom of `recorder.onstop`. The empty
blob guard's own `setState('idle')` call at line 122 stays — that path never dispatches
the event, so the listener won't fire.

---

## State Machine Flow

```
pointerdown
  └─ acquireMic() → startRecording()
       └─ setState('recording')

pointerup / pointercancel
  └─ stopRecording()
       └─ recorder.stop() + setState('processing')
            └─ recorder.onstop fires
                 ├─ [empty blob] → setState('idle')  // guard path unchanged
                 └─ [valid blob] → dispatchEvent('audio-captured')
                      └─ document listener fires
                           └─ transcribeAndDisplay(blob)
                                ├─ await fetch('/api/transcribe', ...)
                                ├─ [network error] → showStatusTemp + setState('idle')
                                ├─ [HTTP error]    → showStatusTemp + setState('idle')
                                └─ [success]       → addTranscriptEntry(text) + setState('idle')
```

The state is always `processing` during the network wait. No extra `setState` calls
are needed inside `transcribeAndDisplay` until exit.

---

## Open Questions

1. **Error entry in transcript panel vs. status bar only**
   - What we know: Requirement says "visible error state." `showStatusTemp` covers
     the status bar. A panel entry is a second channel.
   - What's unclear: Whether to also append `[TRANSCRIPTION FAILED]` as a dim entry
     in `.transcript-panel`, or whether the status bar is sufficient.
   - Recommendation: Add a panel error entry styled with `color: var(--text-dim)` plus
     an `[ERR]` prefix. It matches the military aesthetic and satisfies the requirement
     more robustly. Planner can mark this as a sub-task within 04-01.

2. **Blob filename extension when MIME is `audio/mp4` (Safari)**
   - What we know: Safari uses `audio/mp4`, so `formData.append('file', blob, 'audio.webm')`
     would send a mismatched extension. Phase 3 already resolves extension from
     `file.type` (not filename), so this is harmless for Whisper.
   - Recommendation: Pass a dynamically computed filename:
     ```javascript
     const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
     formData.append('file', blob, `audio.${ext}`);
     ```
     This is a one-liner and avoids any future confusion.

---

## Sources

### Primary (HIGH confidence)
- MDN — FormData: https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest_API/Using_FormData_Objects
- MDN — Fetch API: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch
- MDN — addEventListener: https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener
- web.dev — Fetch error handling: https://web.dev/articles/fetch-api-error-handling
- Existing codebase: app.js, api/transcribe.js, index.html, style.css (direct inspection)

### Secondary (MEDIUM confidence)
- CSS-Tricks — Comparing DOM append methods: https://css-tricks.com/comparing-methods-for-appending-and-inserting-with-javascript/
- muffinman.io — Uploading files using fetch and FormData: https://muffinman.io/blog/uploading-files-using-fetch-multipart-form-data/
- codestudy.net — Fetch missing boundary in multipart/form-data: https://www.codestudy.net/blog/fetch-missing-boundary-in-multipart-form-data-post/

---

## Metadata

**Confidence breakdown:**
- Fetch + FormData pattern: HIGH — MDN primary source, consistent across all references
- Event listener on document: HIGH — verified against existing Phase 2 dispatch pattern
- DOM append via createElement: HIGH — MDN primary source, XSS reasoning is definitive
- Auto-scroll one-liner: HIGH — widely documented, no edge cases at this transcript volume
- onstop mutation (delete one line): HIGH — direct code inspection of app.js lines 113-132

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable browser APIs, no expiry risk)
