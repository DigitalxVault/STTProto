# Phase 3: Vercel Proxy - Research

**Researched:** 2026-03-25
**Domain:** Vercel serverless functions, OpenAI Whisper API, Node.js multipart handling
**Confidence:** HIGH

## Summary

The goal is a single serverless function at `api/transcribe.js` that receives an audio blob via multipart/form-data, forwards it to OpenAI Whisper, and returns `{ text: "..." }`. All three critical technical questions (function shape, multipart parsing, Whisper forwarding) have authoritative answers from official Vercel and OpenAI documentation.

**Vercel now uses the Web Standard `Request`/`Response` API** for non-Next.js `api/` functions. The legacy `req`/`res` + `export const config = { api: { bodyParser: false } }` pattern is for Next.js pages router only. For a standalone `api/transcribe.js`, the correct pattern is either `export default { fetch(request) {} }` (fetch Web Standard) or `export async function POST(request) {}` (HTTP-verb named export). Both expose the standard `Request` object with `.formData()`.

**Multipart parsing requires no library.** The standard Web API `await request.formData()` parses the multipart body natively in Node.js 18+, returning a `FormData` object from which you call `.get('file')` to retrieve the uploaded file as a `File`/`Blob`.

**Forwarding to Whisper without filesystem** uses the `toFile()` helper exported from the `openai` npm package. It accepts a `Buffer`, `ArrayBuffer`, `Blob`, or any `AsyncIterable`, plus a filename and content-type, and returns a `File`-like object that `openai.audio.transcriptions.create()` accepts. This is the canonical serverless approach — no `fs.createReadStream()` needed.

**Primary recommendation:** Use the Web Standard export, parse with `request.formData()`, forward with `openai` SDK + `toFile`, set `maxDuration: 30` in `vercel.json` for the Whisper call, and enforce a 4 MB client-side size guard since Vercel's hard limit is 4.5 MB.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `openai` | ^4.x | OpenAI SDK including Whisper client + `toFile` helper | Official SDK; `toFile` solves the no-filesystem problem cleanly |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None | — | Multipart parsing | Native `request.formData()` is sufficient for Node 18+ |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `request.formData()` | `formidable`, `busboy`, `multiparty` | Third-party libs require `npm install`, are heavier, and were needed only pre-Node 18; native is simpler |
| `openai` SDK + `toFile` | Raw `fetch` + manual `FormData` | Manual approach is fragile around boundary generation and file object creation; SDK handles it correctly |
| Web Standard export | Legacy `req`/`res` handler | Legacy pattern requires `@vercel/node` types and `export const config`; Web Standard is the current Vercel recommendation for standalone functions |

**Installation:**
```bash
npm init -y
npm install openai
```
(No other dependencies needed. `openai` SDK is the only external package.)

## Architecture Patterns

### Recommended Project Structure
```
api/
└── transcribe.js       # Single serverless function
.env.example            # Documents OPENAI_API_KEY (no actual value)
vercel.json             # Existing file — add maxDuration for api/transcribe.js
package.json            # New — required for openai dependency
```

### Pattern 1: Web Standard Export (current Vercel recommendation)
**What:** Export a `fetch` handler on the default export object. Vercel routes all HTTP methods through it.
**When to use:** Non-Next.js, standalone `api/` directory functions.
**Example:**
```javascript
// Source: https://vercel.com/docs/functions/runtimes/node-js
import OpenAI, { toFile } from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default {
  async fetch(request) {
    if (request.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }
    // ... handler body
  },
};
```

### Pattern 2: Named HTTP Verb Export (also valid)
**What:** Export a function named `POST` (or `GET`, etc.). Vercel routes only matching methods.
**When to use:** When you want Vercel to enforce the method automatically.
```javascript
// Source: https://vercel.com/docs/functions/functions-api-reference
export async function POST(request) {
  // ...
}
```

### Pattern 3: Parsing multipart and forwarding to Whisper
**What:** Use native `request.formData()` to extract the audio file, then `toFile()` to wrap the buffer for the OpenAI SDK.
**When to use:** Always — this is the single correct approach in a no-filesystem serverless context.
```javascript
// Source: Vercel Node.js docs + OpenAI SDK source (src/internal/to-file.ts)
import OpenAI, { toFile } from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request) {
  const formData = await request.formData();
  const file = formData.get('file'); // returns a File/Blob object

  if (!file) {
    return Response.json({ error: 'No file provided' }, { status: 400 });
  }

  // Convert Blob to ArrayBuffer, then wrap with toFile
  // The filename extension is what Whisper uses to detect format — use the
  // MIME type to derive it (webm -> .webm, audio/mp4 -> .mp4)
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const ext = file.type === 'audio/mp4' ? 'mp4' : 'webm';

  const transcription = await openai.audio.transcriptions.create({
    file: await toFile(buffer, `audio.${ext}`, { type: file.type }),
    model: 'whisper-1',
  });

  return Response.json({ text: transcription.text });
}
```

### Pattern 4: maxDuration configuration in vercel.json
**What:** Set per-function timeout in `vercel.json` using the `functions` key.
**When to use:** Any function that calls external APIs with variable latency.
```json
// Source: https://vercel.com/docs/functions/configuring-functions/duration
{
  "headers": [
    { "source": "/sw.js", "headers": [{ "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" }] }
  ],
  "functions": {
    "api/transcribe.js": {
      "maxDuration": 30
    }
  }
}
```

### Pattern 5: Environment variable access
**What:** Standard Node.js `process.env` — no special Vercel API needed.
```javascript
// Source: Vercel Node.js runtime docs
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
// In production: set via Vercel Dashboard > Settings > Environment Variables
// In local dev: set via .env.local (gitignored by Vercel CLI)
```

### Anti-Patterns to Avoid
- **Using `fs.createReadStream()`:** No writable filesystem in Vercel serverless. Use `toFile()` with a buffer instead.
- **Using the legacy `req`/`res` + `bodyParser: false` config:** That is a Next.js pages-router-only pattern. It does not apply to standalone `api/` files.
- **Forgetting to set a filename with the correct extension:** Whisper uses the filename extension (not MIME type header) for format detection. Passing `audio.bin` will cause a 400 from OpenAI. Must pass `audio.webm` or `audio.mp4`.
- **Not checking `OPENAI_API_KEY` before calling:** Will produce a generic 401 from OpenAI rather than a clear error message.
- **Setting `maxDuration` above 300 on Hobby plan:** Hard cap is 300s on Hobby with fluid compute. Values above this will be rejected at deploy time.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multipart body parsing | Custom boundary splitting | `request.formData()` | Built into Node 18+ Web API; handles boundary edge cases, encoding, etc. |
| File-like object from Buffer | Manual FormData with Blob | `toFile()` from `openai` | Handles all buffer types, sets correct MIME, tested against the OpenAI upload format |
| OpenAI API calls | Raw `fetch` to `api.openai.com` | `openai` SDK | Error handling, retries, response parsing, type safety all included |
| Environment variable validation | Custom config module | Inline `if (!process.env.OPENAI_API_KEY)` check at function start | The function is small; early-exit guard is sufficient |

**Key insight:** The `openai` SDK is the one required dependency. Everything else (parsing, response, env vars) uses platform primitives.

## Common Pitfalls

### Pitfall 1: Whisper rejects file because extension is wrong
**What goes wrong:** `POST https://api.openai.com/v1/audio/transcriptions` returns 400 with "Invalid file format".
**Why it happens:** Whisper detects format from the filename in the `Content-Disposition` header, not the MIME type. If you pass `toFile(buffer, 'recording', { type: 'audio/webm' })` without an extension, Whisper cannot determine the codec.
**How to avoid:** Always include the extension: `toFile(buffer, 'audio.webm', { type: 'audio/webm' })`.
**Warning signs:** 400 error from OpenAI API referencing "unsupported file format" despite correct MIME type.

### Pitfall 2: 413 FUNCTION_PAYLOAD_TOO_LARGE
**What goes wrong:** Vercel returns HTTP 413 before the function even runs.
**Why it happens:** Vercel's hard limit for request body is 4.5 MB. A ~90-second webm/opus recording at 48kbps is ~500 KB — well within limit. But longer recordings or accidentally sending raw PCM/WAV could exceed it.
**How to avoid:** Enforce a 4 MB size check on the client before sending. Document the limit clearly. Optionally check `request.headers.get('content-length')` at function start and return 413 with a clear message before attempting `formData()`.
**Warning signs:** 413 with body `{ error: { code: "FUNCTION_PAYLOAD_TOO_LARGE" } }`.

### Pitfall 3: Missing OPENAI_API_KEY in environment
**What goes wrong:** OpenAI SDK throws `AuthenticationError` or the function returns 500.
**Why it happens:** `process.env.OPENAI_API_KEY` is `undefined` — either not set in Vercel dashboard or not present in `.env.local` for local dev.
**How to avoid:** Add an explicit guard at the top of the handler:
```javascript
if (!process.env.OPENAI_API_KEY) {
  return Response.json({ error: 'Server configuration error' }, { status: 500 });
}
```
**Warning signs:** `OpenAI API error: 401 - { "error": { "type": "invalid_request_error" } }` in logs.

### Pitfall 4: CORS errors (if frontend domain differs from API domain)
**What goes wrong:** Browser blocks response with CORS error.
**Why it happens:** Only relevant if the frontend and function are on different origins. For a same-Vercel-deployment setup (frontend at `myapp.vercel.app` and function at `myapp.vercel.app/api/transcribe`), same-origin rules apply and no CORS headers are needed.
**How to avoid:** No action needed for same-origin deployment. If testing from `localhost` against a deployed Vercel URL (cross-origin), use `vercel dev` locally to keep same-origin.
**Warning signs:** Browser console shows `Access-Control-Allow-Origin` errors.

### Pitfall 5: Timeout on Hobby plan with long audio
**What goes wrong:** Function returns 504 `FUNCTION_INVOCATION_TIMEOUT`.
**Why it happens:** Fluid compute is enabled by default; Hobby plan default and max is 300s. However, Whisper API itself is fast for short recordings (a 30-second clip transcribes in ~2-5 seconds). Only very long recordings (approaching 25 MB) would risk timeout.
**How to avoid:** Set `maxDuration: 30` in `vercel.json` — this is enough margin for typical STT prototype use. The requirement says "within 30 seconds" which aligns with a 30s maxDuration.
**Warning signs:** 504 on recordings longer than ~5 minutes.

### Pitfall 6: `request.formData()` called on non-multipart request
**What goes wrong:** `request.formData()` throws because the content-type is not `multipart/form-data`.
**Why it happens:** Client sent audio as raw binary (`application/octet-stream`) or JSON base64 instead of FormData.
**How to avoid:** Check `request.headers.get('content-type')` starts with `multipart/form-data` before calling `formData()`, or document the required client format clearly.

## Code Examples

### Complete api/transcribe.js
```javascript
// Source pattern from: Vercel Node.js runtime docs + OpenAI SDK toFile source
import OpenAI, { toFile } from 'openai';

export async function POST(request) {
  // Guard: API key must be configured
  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      { error: 'Server configuration error: missing API key' },
      { status: 500 }
    );
  }

  // Guard: correct content type
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.startsWith('multipart/form-data')) {
    return Response.json(
      { error: 'Expected multipart/form-data' },
      { status: 400 }
    );
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: 'Failed to parse form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return Response.json({ error: 'No audio file provided' }, { status: 400 });
  }

  // Guard: size (Vercel hard limit is 4.5 MB; we enforce 4 MB for safety)
  if (file.size > 4 * 1024 * 1024) {
    return Response.json(
      { error: 'Audio file exceeds 4 MB limit' },
      { status: 413 }
    );
  }

  // Derive extension from MIME type — Whisper uses filename extension for detection
  const mimeToExt = {
    'audio/webm': 'webm',
    'audio/mp4': 'mp4',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'audio/mpeg': 'mp3',
  };
  const ext = mimeToExt[file.type] ?? 'webm';

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const transcription = await openai.audio.transcriptions.create({
      file: await toFile(buffer, `audio.${ext}`, { type: file.type }),
      model: 'whisper-1',
    });

    return Response.json({ text: transcription.text });
  } catch (err) {
    // Surface OpenAI errors clearly
    const status = err?.status ?? 500;
    const message = err?.message ?? 'Transcription failed';
    return Response.json({ error: message }, { status });
  }
}
```

### vercel.json with maxDuration added
```json
{
  "headers": [
    {
      "source": "/sw.js",
      "headers": [
        { "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" }
      ]
    }
  ],
  "functions": {
    "api/transcribe.js": {
      "maxDuration": 30
    }
  }
}
```

### .env.example
```
# OpenAI API Key — required for /api/transcribe
# Obtain at: https://platform.openai.com/api-keys
# Set in Vercel: Dashboard > Project > Settings > Environment Variables
OPENAI_API_KEY=your_openai_api_key_here
```

### package.json (minimal)
```json
{
  "name": "stt-prototype",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "openai": "^4.0.0"
  }
}
```

### curl test command (independent verification)
```bash
curl -X POST https://your-deployment.vercel.app/api/transcribe \
  -F "file=@/path/to/test.webm" \
  -H "Accept: application/json"
```

### Local dev with vercel dev
```bash
# Requires OPENAI_API_KEY in .env.local (gitignored)
echo "OPENAI_API_KEY=sk-..." > .env.local
npx vercel dev
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Legacy `req`/`res` handler with `export const config = { api: { bodyParser: false } }` | Web Standard `export async function POST(request)` | Vercel ~2023 | Cleaner, no special config needed, same Web API as Edge Runtime |
| `formidable`/`busboy` for multipart | Native `request.formData()` | Node 18 (2022) | Zero extra dependencies for form parsing |
| Write file to `/tmp`, use `fs.createReadStream()` | `toFile(buffer, filename)` from `openai` SDK | openai SDK v4 (2023) | No filesystem required; works in all serverless environments |
| Vercel Hobby 10s timeout | 300s with fluid compute (default) | 2024 | Whisper calls are feasible on Hobby without workarounds |

**Deprecated/outdated:**
- `formidable` / `multiparty` for multipart in this context: Still works but adds unnecessary dependency when `request.formData()` is available
- `fs.createReadStream()` with Whisper: Requires writable `/tmp` which is not guaranteed across function invocations; `toFile()` is the correct replacement
- `openai.createTranscription()`: Old v3 SDK method; replaced by `openai.audio.transcriptions.create()` in SDK v4

## Open Questions

1. **`package.json` type field: `"module"` vs CommonJS**
   - What we know: Vercel Node.js runtime supports both ES modules (`.mjs` or `"type":"module"`) and CommonJS. The `import` syntax requires either `.mjs` extension or `"type":"module"` in `package.json`.
   - What's unclear: Whether this project has a preference. The existing project files (sw.js, app.js) appear to use vanilla JS with no bundler.
   - Recommendation: Use `"type": "module"` in `package.json` to enable `import` syntax cleanly, or name the file `transcribe.mjs`. Alternatively, use CommonJS `require()` syntax if ES modules create complexity — both work on Vercel.

2. **Whisper `prompt` parameter for NATO prowords**
   - What we know: The context mentions seeding with NATO prowords for accuracy. Whisper accepts an optional `prompt` string.
   - What's unclear: Whether Phase 3 should include this or defer to Phase 4 (frontend integration).
   - Recommendation: Add `prompt` as an optional form field in the function so it can be tested independently, but don't hard-code prowords yet.

3. **`"type": "module"` compatibility with `toFile` import**
   - What we know: `toFile` is exported from the `openai` package as a named export.
   - What's unclear: Whether `import OpenAI, { toFile } from 'openai'` works cleanly with the version of Node.js Vercel deploys (currently Node 20 as default).
   - Recommendation: This is standard ES module named export syntax that works in Node 18+; confidence is HIGH that it works.

## Sources

### Primary (HIGH confidence)
- [Vercel Node.js Runtime docs](https://vercel.com/docs/functions/runtimes/node-js) — function signature, Web Standard export pattern, Node.js helpers, body parsing table
- [Vercel Functions API Reference](https://vercel.com/docs/functions/functions-api-reference) — confirmed `export function POST(request)` and `export default { fetch }` patterns
- [Vercel Functions Limitations](https://vercel.com/docs/functions/limitations) — confirmed 4.5 MB body limit and 300s Hobby timeout
- [Vercel maxDuration configuration](https://vercel.com/docs/functions/configuring-functions/duration) — confirmed `vercel.json` `functions` key syntax, Hobby 300s max
- [OpenAI SDK `toFile` source](https://raw.githubusercontent.com/openai/openai-node/master/src/internal/to-file.ts) — confirmed function signature accepts `Buffer`, `ArrayBuffer`, `BlobLike`, `AsyncIterable`

### Secondary (MEDIUM confidence)
- [Vercel CORS docs](https://vercel.com/kb/guide/how-to-enable-cors) — confirmed CORS not needed for same-origin deployments
- [DEV.to: Whisper without filesystem](https://dev.to/ajones_codes/how-to-get-audio-transcriptions-from-whisper-without-a-file-system-21ek) — practical pattern confirmed via official SDK source

### Tertiary (LOW confidence)
- [DEV.to: Building with Whisper on Vercel](https://dev.to/sidharth_sangelia/building-my-first-ai-powered-app-from-whisper-to-vercel-limits-1cf) — mentioned 10s timeout for Hobby, but this is outdated (pre-fluid compute). Official Vercel docs confirm 300s is current.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `openai` SDK is the official library; `request.formData()` is a Node 18 Web standard
- Architecture: HIGH — Function shape patterns confirmed directly from Vercel official docs
- Pitfalls: HIGH for body size, extension naming, env var; MEDIUM for CORS edge cases
- Timeout limits: HIGH — fetched directly from Vercel limitations page on 2026-03-25

**Research date:** 2026-03-25
**Valid until:** 2026-06-25 (90 days — Vercel function APIs are stable; fluid compute is now default)
