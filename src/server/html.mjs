// glashjs SSR HTML layer
// ---------------------------------------------------------------------------
// A secure-by-default templating helper + full-document renderer. The `html`
// tagged template ESCAPES every interpolation (so user data can't inject
// markup — XSS-safe by default, matching the security pillar). Use `raw()` to
// deliberately embed already-rendered HTML (e.g. a nested component).
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function raw(value) {
  return { __raw: String(value) };
}

function interpolate(v) {
  if (v == null || v === false) return '';
  if (Array.isArray(v)) return v.map(interpolate).join('');
  if (typeof v === 'object' && '__raw' in v) return v.__raw;
  return escapeHtml(v);
}

export function html(strings, ...values) {
  let out = '';
  strings.forEach((str, i) => { out += str + (i < values.length ? interpolate(values[i]) : ''); });
  return raw(out);
}

/**
 * Wrap a page body into a full HTML document with the glashjs runtime wired in:
 * favicon, animated-favicon runtime, and offline service-worker registration.
 * The runtime imports are resilient (try/catch) so pages still render in `dev`
 * before a `glash build` has produced those files.
 */
function shellOpen({ title = 'glashjs', head = '', lang = 'en', favicon = '/favicon.svg' }) {
  const headHtml = typeof head === 'object' && head?.__raw ? head.__raw : String(head ?? '');
  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="icon" href="${escapeHtml(favicon)}" type="image/svg+xml">
<link rel="manifest" href="/manifest.webmanifest">
${headHtml}
</head>
<body>
`;
}

function shellTail({ offline = true, animatedFavicon = true, dev = false, nonce = '' }) {
  const n = nonce ? ` nonce="${escapeHtml(nonce)}"` : '';
  const fav = animatedFavicon
    ? `<script type="module"${n}>try{const m=await import("/glash-favicon.mjs");m.startGlashFavicon&&m.startGlashFavicon();}catch{}</script>`
    : '';
  const off = offline
    ? `<script type="module"${n}>try{const m=await import("/glash-offline.mjs");m.registerGlashOffline&&m.registerGlashOffline();}catch{}</script>`
    : '';
  // Dev live-reload: a nonce'd inline script (CSP-safe) that reloads on change.
  const hmr = dev
    ? `<script${n}>try{new EventSource("/_glash/hmr").onmessage=function(e){if(e.data==="reload")location.reload();};}catch(e){}</script>`
    : '';
  // Client-side navigation runtime (external 'self' module, CSP-safe).
  const nav = '<script type="module" src="/_glash/nav.js"></script>';
  return `\n${fav}${off}${hmr}${nav}\n</body>\n</html>`;
}

/**
 * Render a route's `metadata` export into <head> tags: description, robots,
 * canonical, keywords, and Open Graph + Twitter cards — the SEO defaults Next
 * makes you wire up by hand.
 */
export function renderMeta(meta = {}) {
  if (!meta || typeof meta !== 'object') return '';
  const tags = [];
  const m = (name, content) => { if (content != null) tags.push(`<meta name="${escapeHtml(name)}" content="${escapeHtml(content)}">`); };
  const p = (prop, content) => { if (content != null) tags.push(`<meta property="${escapeHtml(prop)}" content="${escapeHtml(content)}">`); };
  m('description', meta.description);
  m('robots', meta.robots);
  m('keywords', Array.isArray(meta.keywords) ? meta.keywords.join(', ') : meta.keywords);
  if (meta.canonical) tags.push(`<link rel="canonical" href="${escapeHtml(meta.canonical)}">`);
  const og = meta.openGraph || {};
  p('og:title', og.title || meta.title);
  p('og:description', og.description || meta.description);
  p('og:image', og.image);
  p('og:url', og.url || meta.canonical);
  p('og:type', og.type || 'website');
  const tw = meta.twitter || {};
  if (og.image || tw.card) m('twitter:card', tw.card || 'summary_large_image');
  m('twitter:title', tw.title || meta.title);
  m('twitter:description', tw.description || meta.description);
  m('twitter:image', tw.image || og.image);
  return tags.join('\n');
}

/** Full document (buffered). */
export function renderDocument(opts = {}) {
  const bodyHtml = typeof opts.body === 'object' && opts.body?.__raw ? opts.body.__raw : String(opts.body ?? '');
  return shellOpen(opts) + bodyHtml + shellTail(opts);
}

/** Streaming document: `open` flushed before the body renders, `tail` after. */
export function documentParts(opts = {}) {
  return { open: shellOpen(opts), tail: shellTail(opts) };
}
