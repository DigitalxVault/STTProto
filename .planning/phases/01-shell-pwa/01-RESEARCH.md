# Phase 1: Shell + PWA - Research

**Researched:** 2026-03-25
**Domain:** PWA installability, service worker caching, CSS dark UI, mobile layout
**Confidence:** HIGH (all critical findings verified against MDN and web.dev official docs)

---

## Summary

Phase 1 builds the installable app shell: a static HTML/CSS/JS file set that passes Chrome's PWA
installability checklist, registers a service worker for offline caching, and renders the full
military-aesthetic UI with all visual button states using CSS only (no JS behavior yet).

The standard approach for a no-framework PWA is: `manifest.json` with required fields + two PNG
icons (192px, 512px) + a service worker using cache-first precaching for static assets + iOS-specific
`<head>` meta tags. The CSS shell uses `100dvh` for full-screen portrait layout, a system monospace
font stack for the military aesthetic, and CSS `@keyframes` for the three mic button states.

Vercel serves files from the project root with no configuration needed for static files. The one
Vercel-specific concern is ensuring `sw.js` gets a `Cache-Control: no-store` header so browsers
always check for updated service worker code — this requires a `vercel.json`.

**Primary recommendation:** Build manifest + icons + service worker first, verify installability in
Chrome DevTools before touching any UI. Installability is a go/no-go gate for the phase.

---

## Standard Stack

### Core

| Library / API | Version | Purpose | Why Standard |
|---------------|---------|---------|--------------|
| Web App Manifest | W3C spec | PWA installability metadata | Required by Chrome/Safari for install prompt |
| Service Worker API | W3C spec | Offline caching, app shell | Required for PWA; Cache Storage API is the right primitive |
| CSS `@keyframes` | CSS3 | Pulse and spinner animations | Zero-dependency, GPU-accelerated |
| `env(safe-area-inset-*)` | CSS env() | iPhone home bar clearance | Required for standalone mode on iOS |

### Supporting

| Tool | Purpose | When to Use |
|------|---------|-------------|
| Chrome DevTools "Application" tab | PWA installability audit | During development to verify manifest + SW |
| Lighthouse PWA audit | Full installability checklist | Before phase sign-off |
| pwabuilder.com/imageGenerator | Generate all icon sizes from one source | Icon creation step |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-written manifest | Workbox / Vite PWA plugin | Plugin adds build step — rejected, project is no-build |
| CSS `@keyframes` pulse | JS-driven animation | JS adds complexity Phase 1 deliberately avoids |
| PNG icons only | SVG icons | SVG not supported in manifest icons on all platforms |

**Installation:** No npm packages. Pure browser APIs.

---

## Architecture Patterns

### Recommended File Structure

```
/ (project root)
├── index.html          # Single page, references manifest + registers SW
├── style.css           # All styles including button state classes
├── app.js              # Empty or stub in Phase 1 (no behavior yet)
├── sw.js               # Service worker: precache + cache-first fetch
├── manifest.json       # PWA manifest
├── vercel.json         # Cache-Control headers for sw.js
└── icons/
    ├── icon-192.png    # Required by Chrome for installability
    ├── icon-512.png    # Required by Chrome for installability
    └── apple-touch-icon.png  # 180x180, required by iOS Safari
```

### Pattern 1: Manifest.json Minimal Viable Configuration

**What:** The smallest manifest that passes Chrome's installability checklist.
**When to use:** Always — this is the baseline.

```json
{
  "name": "RADStrat RT Trainer",
  "short_name": "RT Trainer",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#1a1a1a",
  "background_color": "#1a1a1a",
  "prefer_related_applications": false,
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "type": "image/png",
      "sizes": "192x192",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-512.png",
      "type": "image/png",
      "sizes": "512x512",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-192-maskable.png",
      "type": "image/png",
      "sizes": "192x192",
      "purpose": "maskable"
    }
  ]
}
```
Source: MDN "Making PWAs installable" + web.dev "Web app manifest"

Key notes:
- `prefer_related_applications: false` — must be absent or false, or Chrome blocks install
- Separate `any` and `maskable` purpose entries — do NOT combine as `"any maskable"` (causes display issues on some platforms)
- `display: "standalone"` — the only value iOS supports for PWA mode
- `orientation: "portrait"` — locks to portrait, matches requirement UI-04

### Pattern 2: iOS Head Meta Tags

**What:** iOS-specific `<head>` tags that Safari requires (it ignores manifest.json for icons).
**When to use:** Always for any PWA targeting iOS.

```html
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="apple-mobile-web-app-title" content="RT Trainer">
  <link rel="manifest" href="/manifest.json">
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
  <meta name="theme-color" content="#1a1a1a">
</head>
```

Critical: `viewport-fit=cover` is required to use `env(safe-area-inset-bottom)` for iPhone home bar
clearance. Without it, the mic button may be obscured by the system home indicator.

Do NOT use `apple-mobile-web-app-capable` meta tag — web.dev explicitly warns this creates a broken
PWA experience that doesn't honor `start_url` or `scope`.

Source: web.dev "Enhancements" chapter, Apple developer docs

### Pattern 3: Service Worker — Cache-First App Shell

**What:** Precache all static assets on install; serve from cache first on every fetch.
**When to use:** App shell assets that don't change between deploys.

```javascript
// sw.js
const CACHE_NAME = "rt-trainer-v1";
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

async function precache() {
  const cache = await caches.open(CACHE_NAME);
  return cache.addAll(PRECACHE_URLS);
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return Response.error();
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache());
  self.skipWaiting(); // activate immediately
});

self.addEventListener("activate", (event) => {
  // Clean up old caches on new deploy
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
});

self.addEventListener("fetch", (event) => {
  // Only cache GET requests for same-origin static assets
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  event.respondWith(cacheFirst(event.request));
});
```
Source: MDN "Caching" guide + web.dev "Caching" chapter

### Pattern 4: Service Worker Registration in index.html

```javascript
// In index.html <script> or app.js
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js")
    .catch(err => console.error("SW registration failed:", err));
}
```

### Pattern 5: CSS Layout — Full-Screen Portrait Shell

**What:** Single-screen app layout filling the full viewport, portrait-locked, with safe-area
clearance for iPhone home bar.

```css
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body {
  height: 100%;
  width: 100%;
  overflow: hidden; /* single-screen, no scroll */
}

body {
  min-height: 100dvh; /* dynamic viewport: accounts for Safari toolbar show/hide */
  background: #0a0a0a;
  color: #c8c8c8;
  font-family: "Courier New", Courier, monospace;
  display: flex;
  flex-direction: column;
  padding-bottom: env(safe-area-inset-bottom, 0px); /* iPhone home bar */
  padding-top: env(safe-area-inset-top, 0px);
}

.transcript-panel {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  /* Content area above mic button */
}

.mic-container {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 1.5rem;
}
```

Note: `100dvh` is supported on iOS 15.4+, Android Chrome 108+. The dynamic unit prevents the
Safari toolbar overlap problem that plagued `100vh` for years.

### Pattern 6: Mic Button — Three Visual States with CSS Only

**What:** All three mic states (idle, recording, processing) implemented purely in CSS using
class toggling. No JS behavior needed in Phase 1 — just render the states statically.

```css
/* Base button */
.mic-btn {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  border: 3px solid #555;
  background: #2a2a2a;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s, border-color 0.2s;
  position: relative;
}

/* State: idle (default — grey) */
.mic-btn.state-idle {
  background: #2a2a2a;
  border-color: #555;
}

/* State: recording (pulsing red) */
.mic-btn.state-recording {
  background: #8b0000;
  border-color: #cc0000;
  animation: pulse-red 1.2s ease-in-out infinite;
}

@keyframes pulse-red {
  0%   { box-shadow: 0 0 0 0 rgba(200, 0, 0, 0.6); }
  70%  { box-shadow: 0 0 0 16px rgba(200, 0, 0, 0); }
  100% { box-shadow: 0 0 0 0 rgba(200, 0, 0, 0); }
}

/* State: processing (spinner overlay) */
.mic-btn.state-processing {
  background: #1a1a1a;
  border-color: #444;
}

.mic-btn.state-processing::after {
  content: "";
  position: absolute;
  width: 40px;
  height: 40px;
  border: 3px solid #333;
  border-top-color: #888;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

For Phase 1 verification: render three separate buttons (one per class) to confirm all states
display correctly. JS state toggling comes in Phase 2.

### Pattern 7: Military Aesthetic CSS

```css
/* Color palette */
:root {
  --bg-primary:    #0a0a0a;  /* near-black background */
  --bg-panel:      #111111;  /* slightly lighter panel */
  --border-dim:    #2a2a2a;  /* subtle borders */
  --text-primary:  #c8c8c8;  /* off-white, not harsh white */
  --text-dim:      #555555;  /* dimmed secondary text */
  --accent-red:    #8b0000;  /* dark military red */
  --accent-green:  #1a4a1a;  /* tactical green (for status indicators) */
}

/* Typography — monospace stack, no external font load needed */
body {
  font-family: "Courier New", Courier, "Lucida Console", monospace;
  font-size: 14px;
  line-height: 1.5;
  letter-spacing: 0.05em;
}

/* Transcript panel military styling */
.transcript-panel {
  background: var(--bg-panel);
  border: 1px solid var(--border-dim);
  font-size: 13px;
  color: var(--text-primary);
}

/* Status indicators can use a green phosphor-screen feel */
.status-bar {
  color: #3a7a3a;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.15em;
}
```

Note: No Google Fonts load. The system monospace stack (`"Courier New", Courier, monospace`)
is universally available, loads instantly, and looks appropriately military/terminal. This is
the right choice for a PWA that needs to work offline.

### Anti-Patterns to Avoid

- **`"any maskable"` combined purpose:** Causes icon display errors on some platforms. Use separate array entries.
- **`100vh` for full-screen layout:** Broken on iOS Safari (toolbar overlap). Use `100dvh`.
- **`apple-mobile-web-app-capable` meta tag:** web.dev explicitly warns this creates a broken PWA that doesn't honor manifest `start_url`/`scope`.
- **Caching `sw.js` itself:** The browser caches the SW file using HTTP cache. Must set `Cache-Control: no-store` on `sw.js` via Vercel config or updates won't roll out.
- **SW scope narrower than app:** If `sw.js` is not at root (`/`), its scope defaults to the directory it's in, not the whole app.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Icon generation | Manual pixel editing at 192/512/180 | pwabuilder.com/imageGenerator | Handles all sizes, safe zones, maskable variants |
| Spinner animation | Canvas or JS-driven animation | CSS `@keyframes` + `::after` pseudo-element | Zero JS, GPU-accelerated, 3 lines |
| Pulse animation | JS interval + style manipulation | CSS `@keyframes` + `box-shadow` | Zero JS, declarative, no timer cleanup |
| Cache strategy | Custom fetch polyfill | Native Cache Storage API | Universally supported, standard interface |

**Key insight:** Every animation and visual state in Phase 1 is pure CSS. No JS needed until Phase 2
when actual mic behavior is wired up.

---

## Common Pitfalls

### Pitfall 1: Service Worker Not Updating

**What goes wrong:** Developer updates `sw.js`, deploys, but users get the old service worker and
old cached assets.
**Why it happens:** Vercel (and most hosts) serves static files with long `Cache-Control` headers.
If `sw.js` itself is cached, the browser never sees the updated version.
**How to avoid:** Add `vercel.json` with a `no-store` header specifically for `sw.js`:

```json
{
  "headers": [
    {
      "source": "/sw.js",
      "headers": [
        { "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" }
      ]
    }
  ]
}
```

**Warning signs:** Lighthouse PWA audit shows stale content; Chrome Application tab shows "waiting"
SW state after deploy.

### Pitfall 2: iOS Safari Ignoring Manifest Icons

**What goes wrong:** PWA installs fine on Android but shows generic icon (screenshot) on iOS.
**Why it happens:** iOS Safari does not read icons from `manifest.json`. It requires an
`apple-touch-icon` `<link>` tag directly in the HTML `<head>`.
**How to avoid:** Always include `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">`
in `index.html`. The file should be 180x180px PNG with no transparency.
**Warning signs:** Add to Home Screen on iPhone shows a screenshot instead of your icon.

### Pitfall 3: Mic Button Hidden Behind iPhone Home Bar

**What goes wrong:** In standalone mode, the mic button at the bottom of the screen is partially
hidden by the iOS home indicator bar.
**Why it happens:** `env(safe-area-inset-bottom)` only works when `viewport-fit=cover` is set in
the viewport meta tag. Without it, the safe area insets are all `0px`.
**How to avoid:** Set `viewport-fit=cover` in the viewport meta tag and apply
`padding-bottom: env(safe-area-inset-bottom, 16px)` to the mic container.
**Warning signs:** On physical iPhone in standalone mode, bottom button appears clipped.

### Pitfall 4: SW Registration Failing in Development

**What goes wrong:** Service worker fails to register, Chrome shows "Unable to register".
**Why it happens:** Service workers require HTTPS or localhost. If developing on a local network
IP (e.g., 192.168.x.x), registration is blocked.
**How to avoid:** Use `localhost` for local dev, or use `vercel dev` which provides HTTPS tunneling.
**Warning signs:** Console error: "An SSL certificate error occurred when fetching the script."

### Pitfall 5: `100vh` on iOS Safari

**What goes wrong:** Full-screen layout is taller than the visible viewport on initial load in
Safari, causing content to be cut off.
**Why it happens:** `100vh` in Safari equals the height when the browser toolbar is hidden (the
maximum possible height). On first load with the toolbar visible, actual visible height is less.
**How to avoid:** Use `min-height: 100dvh` instead of `height: 100vh`. `dvh` updates dynamically
as the toolbar shows/hides. Supported in Safari 15.4+ (iOS 15.4+).
**Warning signs:** Bottom button appears cut off in Safari before any scrolling.

### Pitfall 6: PWA Installability Fails Silently

**What goes wrong:** Chrome does not show the install prompt or "Add to Home Screen" option.
**Why it happens:** One missing manifest field, a missing icon size, or the service worker not
yet controlling a page fetch blocks installability — and there's no obvious error.
**How to avoid:** Check Chrome DevTools → Application → Manifest section. It shows exactly which
criteria are met/failed. Lighthouse PWA audit gives a full report.
**Warning signs:** No install prompt appears after serving over HTTPS.

---

## Code Examples

### Complete minimal sw.js for Phase 1

```javascript
// sw.js — Source: MDN Caching guide + web.dev Caching chapter
const CACHE_NAME = "rt-trainer-v1";
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
```

### vercel.json for sw.js cache headers

```json
{
  "headers": [
    {
      "source": "/sw.js",
      "headers": [
        { "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" }
      ]
    }
  ]
}
```

### index.html head section

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="theme-color" content="#1a1a1a">
  <meta name="apple-mobile-web-app-title" content="RT Trainer">
  <link rel="manifest" href="/manifest.json">
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
  <title>RADStrat RT Trainer</title>
  <link rel="stylesheet" href="/style.css">
</head>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `height: 100vh` for full screen | `min-height: 100dvh` | Safari 15.4 / 2022 | Fixes iOS toolbar overlap |
| `apple-mobile-web-app-capable` meta | `display: standalone` in manifest | iOS 16.4 / 2023 | Manifest now works for install; old tag causes broken PWA |
| Single icon at 192px | Separate `any` + `maskable` icons | Android adaptive icons ~2019 | Without maskable, icon appears as small square in circle |
| JS interval for button pulse | CSS `@keyframes` + `box-shadow` | CSS3 broadly adopted | Declarative, GPU-accelerated, no JS timer management |

**Deprecated / outdated:**
- `apple-mobile-web-app-capable` meta tag: Still works but web.dev warns it creates a broken PWA experience that ignores manifest `start_url` and `scope`
- `height: 100vh` for full-viewport apps: Use `100dvh` instead on modern targets (Safari 15.4+)
- `"purpose": "any maskable"` combined: Split into two separate icon entries

---

## Open Questions

1. **Minimum iOS version to support**
   - What we know: `100dvh` requires iOS 15.4+; PWA install from non-Safari browsers requires iOS 16.4+
   - What's unclear: Project hasn't specified minimum iOS version
   - Recommendation: Design for iOS 16.4+ (allows Chrome/Edge install). Use `100dvh` — devices below 15.4 will fall back to `100vh` behavior gracefully.

2. **Icon creation workflow**
   - What we know: Need 192px, 512px (PNG, no transparency), and 180px apple-touch-icon
   - What's unclear: Whether project has brand assets or logo to use as icon source
   - Recommendation: Create a minimal tactical icon (e.g., microphone/radio silhouette) using pwabuilder.com image generator from a single SVG. For Phase 1 a placeholder solid-color icon is sufficient to pass installability.

3. **Vercel deployment output directory**
   - What we know: Vercel serves from project root for static sites, output directory must be set to `"."` in Vercel dashboard (not needed in `vercel.json`)
   - What's unclear: Whether repo will have a separate `public/` folder or serve straight from root
   - Recommendation: Use project root directly (matches the decided file structure). Set Output Directory to `.` in Vercel project settings.

---

## Sources

### Primary (HIGH confidence)
- MDN "Making PWAs installable" — https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable — manifest required fields, service worker note, iOS version requirements
- MDN "Define app icons" — https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Define_app_icons — icon sizes, maskable icons, safe zone
- MDN "Caching" — https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Caching — cache-first pattern code
- web.dev "Web app manifest" — https://web.dev/learn/pwa/web-app-manifest — manifest fields, display modes, theme_color behavior
- web.dev "Caching" — https://web.dev/learn/pwa/caching — precaching install event, fetch cache-first code examples
- web.dev "Enhancements" — https://web.dev/learn/pwa/enhancements — iOS meta tags, apple-mobile-web-app-capable warning

### Secondary (MEDIUM confidence)
- WebSearch "PWA icons requirements 2025" → verified with MDN Define app icons: 192px + 512px minimum, separate maskable entry
- WebSearch "100dvh mobile safari safe-area-inset" → verified with MDN viewport units: `100dvh` supported Safari 15.4+, `viewport-fit=cover` required for safe-area-inset

### Tertiary (LOW confidence)
- WebSearch Vercel static serving — single blog post pattern (Output Directory: `.`) — not verified with Vercel official docs
- WebSearch CSS military aesthetic — community articles on dark UI patterns — not verified with any spec

---

## Metadata

**Confidence breakdown:**
- Standard stack (PWA manifest, SW API): HIGH — verified against MDN and web.dev official docs
- Architecture (manifest fields, SW code): HIGH — code examples sourced directly from MDN/web.dev
- iOS specifics (apple-touch-icon, viewport-fit): HIGH — verified against web.dev Enhancements chapter
- CSS patterns (dvh, safe-area, keyframes): HIGH — verified against MDN and multiple current sources
- Vercel deployment config: MEDIUM — confirmed pattern from community sources, no Vercel official doc fetched
- Icon maskable requirement: HIGH — confirmed by both MDN and web.dev sources

**Research date:** 2026-03-25
**Valid until:** 2026-09-25 (PWA spec is stable; browser support table may shift faster)
