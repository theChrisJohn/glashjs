// glashjs security defaults
// ---------------------------------------------------------------------------
// "Unhackable" isn't real — but "hard to hack by default" is. glashjs ships a
// strict, opinionated baseline so a site is secure unless you deliberately
// loosen it: strict CSP (no inline scripts), tight framing/MIME/referrer,
// HSTS, isolation headers, and helpers for Subresource Integrity on assets.
import { createHash } from 'node:crypto';

/**
 * Strict Content-Security-Policy. No 'unsafe-inline' for scripts — glashjs
 * builds hash/nonce-based, so XSS via injected <script> is blocked by default.
 * Pass `connectSrc` to allow your API/realtime origins.
 */
export function buildCsp({
  connectSrc = ["'self'"],
  imgSrc = ["'self'", 'data:', 'blob:'],
  mediaSrc = ["'self'", 'blob:'],
  styleSrc = ["'self'"],
  scriptSrc = ["'self'"],
  nonce,
} = {}) {
  const script = nonce ? [...scriptSrc, `'nonce-${nonce}'`] : scriptSrc;
  const directives = {
    'default-src': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'"],
    'script-src': script,
    'style-src': styleSrc,
    'img-src': imgSrc,
    'media-src': mediaSrc,
    'connect-src': connectSrc,
    'worker-src': ["'self'"],
    'manifest-src': ["'self'"],
    'upgrade-insecure-requests': [],
  };
  return Object.entries(directives)
    .map(([k, v]) => (v.length ? `${k} ${v.join(' ')}` : k))
    .join('; ');
}

/** The full secure-by-default response header set for a glashjs site. */
export function securityHeaders(opts = {}) {
  return {
    'Content-Security-Policy': buildCsp(opts.csp ?? {}),
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), browsing-topics=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': opts.coep ?? 'credentialless',
    'Origin-Agent-Cluster': '?1',
    'X-DNS-Prefetch-Control': 'off',
  };
}

/** Subresource Integrity hash for a built asset buffer (sri="sha384-..."). */
export function sri(buf, algo = 'sha384') {
  return `${algo}-${createHash(algo).update(buf).digest('base64')}`;
}

/** Express/Connect-style middleware applying the security headers. */
export function glashSecurity(opts = {}) {
  const headers = securityHeaders(opts);
  return (_req, res, next) => {
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    if (typeof next === 'function') next();
  };
}
