# glashjs

The glashdb-native web framework — **a Next.js alternative** with the file-based routing, SSR, API routes, layouts, and JSX component model you know from Next, made **fast, offline-capable, and secure by default**. It ships real features instead of promises.

> **Status:** `0.6.0` — the full framework is here: file-based routing, server-side rendering, API routes, JSX components with client hydration, nested layouts, streaming SSR, a dev/prod server, plus the asset optimizer, offline service worker, animated favicon, and secure-by-default headers. Core installs with zero mandatory dependencies.

## What it does today

```bash
glash build            # optimize assets, emit offline SW + PWA + security manifests
glash optimize public  # just run the asset optimizer over a directory
```

Run against the real glashdb SVG logos (zero optional deps installed):

```
assets        6
original      33.2 KB
optimized     10.1 KB
saved         69.7%   ← real Brotli, browser-transparent
offline       10 files precached (works offline after first visit)
security      strict CSP + 11 headers
```

## The three pillars

### 1. Asset optimizer — the smallest payload a browser can decode
At build time glashjs re-encodes every asset to the leanest format the client supports, then serves the best variant per request — no config, no runtime image server, originals never touched. How each asset type is handled:
- **Text / SVG / JS / CSS / HTML** → **Brotli + Gzip** (`zlib`, built in). Real 4–8× on text/SVG. The browser decompresses transparently via `Content-Encoding` — compress on build, decompress in the browser.
- **jpg / png / webp** → **AVIF + WebP** variants (needs optional `sharp`). Typically 3–10× vs unoptimized originals.
- **mp4 / mov / webm** → **AV1** + poster frame (needs optional `ffmpeg`).
- Emits `glash-assets.manifest.json` so the glashdb edge (or any server) serves the best variant per client. Originals are never mutated.

> **glashjs installs with zero dependencies.** Brotli/Gzip works out of the box.
> To enable image/video transcoding, add the optional enhancers yourself:
> `npm i sharp` (AVIF/WebP) and install `ffmpeg` on your PATH (AV1). They're
> declared as **optional peers**, so a plain `npm i glashjs` pulls nothing else.

### 2. Offline layer — usable with no internet after first visit
Generates a **Service Worker** (`glash-sw.js`) + PWA manifest that precache the app shell and hashed assets into small cached files. Strategies:
- **assets** → cache-first (immutable, hash-busted on deploy)
- **HTML** → stale-while-revalidate (instant, self-healing)
- **`/api` `/rest` `/auth` `/live` `/stream`** → **network-first**, so offline mode degrades *exactly* at live/updated data and streaming — the site keeps working, just without fresh data. (Configurable via `dataPrefixes`.)

### 3. Security — secure by default
glashjs ships strong, opinionated defaults so you're secure unless you loosen them:
- **Strict CSP** with no `'unsafe-inline'` scripts (XSS-via-injection blocked by default)
- HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`, COOP/COEP/CORP isolation, tight `Permissions-Policy` & `Referrer-Policy`
- **Subresource Integrity** helper (`sri()`) for build assets
- Emitted to `glash-headers.json` for the edge, plus a `glashSecurity()` Express middleware

## Routing, SSR & API (new in 0.1)
glashjs now has a real server runtime — **file-based routing**, **server-side rendering**, and **API routes** — on Node built-ins, zero deps.

```
routes/
  index.mjs          ->  /                 (SSR page)
  about.mjs          ->  /about
  blog/[slug].mjs    ->  /blog/:slug       (dynamic segment -> ctx.params.slug)
  docs/[...path].mjs ->  /docs/*           (catch-all)
  api/hello.mjs      ->  /api/hello        (API: export GET/POST/…)
  404.jsx            ->  custom not-found page (any unmatched path -> 404)
  500.jsx            ->  custom error page (rendered in production on a throw)
```

```js
// routes/index.mjs  — a server-rendered page (XSS-safe `html` template)
import { html } from 'glashjs';
export default (ctx) => ({ title: 'Home', body: html`<h1>Hello ${ctx.query.name}</h1>` });

// routes/api/hello.mjs — an API route
import { json } from 'glashjs';
export const GET  = (ctx) => ({ ok: true, name: ctx.query.name });
export const POST = (ctx) => json({ created: ctx.body }, { status: 201 });
```

```bash
glash dev      # dev server: routing + SSR + API, live route reload
glash serve    # production server over routes/ + built assets (Brotli-negotiated)
```

**`<Image>`** (better than `next/image` — no runtime image server, uses the build's AVIF/WebP):
```jsx
import { Image } from 'glashjs/image';
<Image src="/hero.png" alt="Hero" width={1200} height={630} />
// -> <picture><source …avif><source …webp><img loading=lazy decoding=async></picture>
```

**File-based middleware** (`_middleware.mjs`, runs root→leaf before the route):
```js
import { redirect } from 'glashjs';
export default (ctx) => { if (!ctx.headers.authorization) return redirect('/login'); };
```

**SEO metadata** + **client-side navigation**:
```jsx
import { Link } from 'glashjs/link';
export const metadata = { title: 'About', description: '…', openGraph: { image: '/og.png' } };
export default () => <Link href="/">Home</Link>;   // SPA swap, no full reload; crawlable <a>
```

Every response carries the secure-by-default headers; static files are served from the build with Brotli negotiation.

### JSX components + client hydration (new in 0.2)
Author pages as **JSX components**, server-render them, and **hydrate** in the browser so hooks work — real interactivity, the Next-style model. Built on **Preact** (React-compatible) + **esbuild**, added as *optional peers* (`npm i preact preact-render-to-string esbuild`); glashjs core stays zero-dep.

```jsx
// routes/counter.jsx  — SSR + hydrated, the button is interactive
import { useState } from 'preact/hooks';
export function getServerData(ctx) { return { start: Number(ctx.query.start || 0) }; }  // server props
export default function Counter({ start = 0 }) {
  const [n, setN] = useState(start);
  return <button onClick={() => setN(n + 1)}>count is {n}</button>;
}
```

Hydration is **CSP-safe**: server props ride in a non-executed `<script type="application/json">` and the hydration bundle is an external `'self'` module with a per-request **nonce** — so the strict CSP stays intact (no `'unsafe-inline'`).

**Nested layouts** (`_layout.jsx` in any routes dir wrap pages root→leaf, server + hydration), **streaming SSR** (the shell flushes before the component renders — `Transfer-Encoding: chunked`), and **instant HMR** (`glash dev` does an in-place soft re-render on save over SSE — no full reload, no flash, and scroll/focus/form-input are preserved across the swap) are all in. **Suspense streaming** is in too — wrap a data-dependent subtree in `<Suspense fallback={…}>` (from `preact/compat`) and the shell + fallback flush immediately, then each boundary streams in as its data resolves (`renderToPipeableStream`), with preact's inline swap scripts nonce-injected so the strict CSP holds. **Honest scope:** uses Preact (React-compatible via `preact/compat`), not React; HMR preserves DOM/scroll/input state but **not** component `useState` (that's React-Fast-Refresh via `@prefresh`, still ahead).

## Usage

```js
// glash.config.mjs
import { defineConfig } from 'glashjs/config';

export default defineConfig({
  name: 'My Site',
  publicDir: 'public',
  outDir: '.glash/out',
  offline: true,
  dataPrefixes: ['/api/', '/rest/', '/live'], // network-first (no stale live data offline)
  // favicon defaults to the official glashdb logo bundled with glashjs
});
```

```js
import { build, optimizeAssets, securityHeaders, sri } from 'glashjs';
```

The preview favicon defaults to the **official glashdb logo** (`templates/favicon.svg`).

### Animated favicon (on by default)
Every build also emits an **animated favicon** — the bundled glash mark, your own
animated SVG/GIF, or a set of frames that cycle in the tab. The build writes a tiny
runtime; call it once and it animates the tab icon, pausing while the tab is hidden:

```js
import { startGlashFavicon } from '/glash-favicon.mjs';
startGlashFavicon(); // config is baked in at build time
```

```js
// glash.config.mjs
animatedFavicon: true,                         // bundled animated glash mark (default)
// animatedFavicon: '/brand/logo-animated.svg' // your own animated SVG/GIF
// animatedFavicon: { frames: ['/f0.svg','/f1.svg'], fps: 10 }
```

## What's built (a Next.js alternative)
- [x] Asset optimizer (Brotli/Gzip real; AVIF/WebP/AV1 via optional sharp/ffmpeg)
- [x] Offline Service Worker + PWA manifest
- [x] Secure-by-default headers + CSP + SRI
- [x] File-based routing (pages + `api/`, dynamic `[param]` & catch-all `[...path]`)
- [x] Server-side rendering (XSS-safe `html` templates) + full-document runtime
- [x] API routes (per-method handlers, JSON body parsing, typed `json()` responses)
- [x] Dev/prod server with live route reload + Brotli-negotiated static serving
- [x] JSX components + client-side hydration (Preact + esbuild) — CSP-safe with nonces
- [x] Client-JS bundling (esbuild) per route
- [x] Nested layouts (`_layout.jsx` composing root→leaf, server + hydration)
- [x] Streaming SSR (shell flushed before the component renders)
- [x] Instant HMR — in-place soft re-render on save (no full reload, no flash; preserves scroll, focus, and form input)
- [x] `<Image>` — zero-config `<picture>` with AVIF/WebP from the optimizer (beats next/image: no runtime image server)
- [x] `<Video>` — `<video>` with AV1/WebM + mp4 fallback + auto poster
- [x] File-based middleware (`_middleware.mjs`, root→leaf) — auth, redirects, headers
- [x] Production route precompile (`glash build` bakes server modules + minified client bundles → no runtime esbuild on `glash serve`)
- [x] SEO metadata API (`export const metadata` → title, description, Open Graph, Twitter cards)
- [x] `<Link>` client-side navigation (SPA swap of `#glash-root` + re-hydrate; progressive-enhancement `<a>`)
- [x] `glash deploy` → glashdb (builds, then hands off to the `glashdb` CLI)
- [x] Production-grade runtime — custom `404`/`500` routes, dev error overlay, HEAD support, Range requests + streamed static (video seeking), graceful mid-stream error handling
- [x] Suspense streaming (`renderToPipeableStream` — fallback in the shell, each boundary streams in as its data resolves; CSP-safe via per-request nonce injection)
- [ ] React-Fast-Refresh (`useState` preservation via `@prefresh`; browser-verified), edge adapter
- [ ] `<Image>` / `<Video>` components that emit `<picture>`/`<source>` from the manifest
- [ ] Edge adapter for the glashdb Worker (serve `.br`/`.avif` by `Accept`)
- [ ] `glash deploy` → glashdb hosting in one command

## Design stance
glashjs is **a Next.js alternative** — it keeps the conventions you know from Next (file-based routing, SSR, layouts, the component model) and composes proven primitives rather than reinventing them. The value is in the **defaults**: every glashjs site is optimized, offline-capable, and secure out of the box.
