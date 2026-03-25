---
phase: 03-vercel-proxy
plan: 01
subsystem: api
tags: [openai, whisper, vercel, serverless, transcription, formdata]

# Dependency graph
requires:
  - phase: 01-shell-pwa
    provides: vercel.json with headers config that was extended in this plan
provides:
  - POST /api/transcribe serverless endpoint using OpenAI Whisper
  - package.json with openai ^4.0.0 dependency and type:module
  - .env.example documenting OPENAI_API_KEY setup
  - vercel.json functions config with maxDuration: 30
affects: [04-integration, any phase that calls /api/transcribe]

# Tech tracking
tech-stack:
  added: [openai ^4.0.0]
  patterns: [Web Standard serverless function (export async function POST), toFile() for binary-to-Whisper conversion, 5-guard request validation pattern]

key-files:
  created: [api/transcribe.js, package.json, package-lock.json, .env.example]
  modified: [vercel.json, .gitignore]

key-decisions:
  - "Web Standard POST export (not legacy req/res) — required for Vercel Edge/Node runtimes"
  - "toFile(buffer, filename, {type}) used to feed ArrayBuffer into Whisper API"
  - "5 ordered guards: API key → content-type → formData parse → file field → 4MB size limit"
  - "MIME-to-ext map covers webm/mp4/ogg/wav/mp3 with webm default"
  - "maxDuration: 30s in vercel.json functions config — Whisper can take ~10-20s for longer clips"
  - "No CORS headers added — Phase 4 integration happens on same origin"

patterns-established:
  - "Guard ordering: env → input format → parse → field presence → size — fail fast at cheapest checks first"
  - "Structured JSON errors with appropriate HTTP status codes (400/413/500)"
  - "OPENAI_API_KEY read exclusively from process.env via new OpenAI() default — never in client code"

# Metrics
duration: 5min
completed: 2026-03-25
---

# Phase 3 Plan 1: Vercel Proxy Summary

**OpenAI Whisper transcription endpoint at POST /api/transcribe using Web Standard serverless function with 5-guard validation and toFile() binary conversion**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-25T05:20:00Z
- **Completed:** 2026-03-25T05:25:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Vercel serverless endpoint POST /api/transcribe ready for curl testing once OPENAI_API_KEY is set
- package.json with openai ^4.0.0 as ESM module — matches existing codebase type:module pattern
- .env.example documents key setup with Vercel Dashboard instructions
- vercel.json extended with functions.maxDuration: 30 alongside existing headers config

## Task Commits

Each task was committed atomically:

1. **Task 1: Create package.json and .env.example** - `0288899` (chore)
2. **Task 2: Create api/transcribe.js and update vercel.json** - `7338067` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `api/transcribe.js` - POST handler: 5 guards, MIME map, toFile + Whisper call, structured errors
- `package.json` - name stt-prototype, type module, openai ^4.0.0
- `package-lock.json` - generated lockfile for 37 packages
- `.env.example` - documents OPENAI_API_KEY with Vercel setup instructions
- `vercel.json` - added functions key with maxDuration: 30 for api/transcribe.js
- `.gitignore` - appended node_modules/ and .env

## Decisions Made
- Used Web Standard `export async function POST` (not `module.exports`) — required for Vercel's Node.js runtime when using ESM
- `toFile()` imported from openai package to convert ArrayBuffer → Whisper-compatible File object — avoids needing node:buffer workarounds
- 5-guard ordering validates cheapest checks first (env key, content-type header) before parsing body
- maxDuration: 30 chosen — Whisper typically takes 5-15s; 30s leaves headroom for larger clips while staying within Vercel Hobby limits
- No CORS headers added — same-origin POST from Phase 4 frontend doesn't require CORS

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

**External services require manual configuration before endpoint is usable.**

1. Copy `.env.example` to `.env` and set `OPENAI_API_KEY`
2. For Vercel deployment: Dashboard > Project > Settings > Environment Variables > add `OPENAI_API_KEY`
3. Verify locally with: `OPENAI_API_KEY=sk-... vercel dev` then curl test

**curl smoke test:**
```bash
curl -X POST http://localhost:3000/api/transcribe \
  -F "file=@test-audio.webm" \
  -H "Accept: application/json"
# Expected: { "text": "..." } with HTTP 200
```

## Next Phase Readiness
- Endpoint is complete and independently testable via curl before any frontend work
- Phase 4 integration: listen for `audio-captured` CustomEvent from app.js (02-02), POST blob to /api/transcribe, display returned text
- Concern: Vercel Hobby plan timeout is 10s for Serverless Functions (not 300s) — maxDuration: 30 may be silently capped; confirm in Vercel dashboard before production use

---
*Phase: 03-vercel-proxy*
*Completed: 2026-03-25*
