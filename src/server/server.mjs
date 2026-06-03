// glashjs server — routing, SSR, and API in one Node http server.
// ---------------------------------------------------------------------------
// `dev: true`  -> re-discovers routes and re-imports modules each request, so
//                 edits show up without a restart (live reload of route code).
// `dev: false` -> caches routes; serves the built `outDir` (optimized assets,
//                 service worker, favicons) with Brotli negotiation.
// Every response carries the secure-by-default headers.
import http from 'node:http';
import { promises as fs, existsSync, statSync, watch } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { discoverRoutes, matchRoute, findMiddleware } from './router.mjs';
import { renderDocument, documentParts, renderMeta } from './html.mjs';
import { NAV_CLIENT } from './nav-client.mjs';
import { isComponentRoute, loadComponentRoute, clientBundle, renderComponent, routeId, findLayouts, clearJsxCaches } from './jsx.mjs';
import { securityHeaders } from '../security/headers.mjs';
import { loadConfig } from '../config.mjs';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.avif': 'image/avif', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
const mime = (file) => MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';

/** Build the glashjs server. Returns { server, listen, cfg }. */
export async function createGlashServer({ root = process.cwd(), dev = false } = {}) {
  const cfg = await loadConfig(root);
  const routesDir = path.resolve(root, cfg.routesDir || 'routes');
  const outDir = path.resolve(root, cfg.outDir);
  const secHeaders = securityHeaders(cfg.security);
  let routes = await discoverRoutes(routesDir);

  const importRoute = (file) =>
    import(pathToFileURL(file).href + (dev ? `?t=${Date.now()}` : ''));

  // Dev live-reload: watch routes/, drop compiled caches, and push a reload
  // event to every connected browser over Server-Sent Events.
  const hmrClients = new Set();
  if (dev) {
    try {
      watch(routesDir, { recursive: true }, () => {
        clearJsxCaches();
        for (const c of hmrClients) c.write('data: reload\n\n');
      });
    } catch { /* fs.watch recursive may be unsupported on some platforms */ }
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = safeDecode(url.pathname);
    try {
      if (dev) routes = await discoverRoutes(routesDir);
      // Dev live-reload SSE channel.
      if (dev && pathname === '/_glash/hmr') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write('retry: 1000\n\n');
        hmrClients.add(res);
        req.on('close', () => hmrClients.delete(res));
        return;
      }
      // Client-side navigation runtime.
      if (pathname === '/_glash/nav.js') {
        return send(res, 200, 'text/javascript; charset=utf-8', NAV_CLIENT, { ...secHeaders, 'cache-control': dev ? 'no-store' : 'public, max-age=31536000, immutable' });
      }
      // Static first: in production this serves prebuilt /_glash/<id>.js bundles
      // (written by `glash build`) — no runtime esbuild needed.
      if (await serveStatic(res, outDir, pathname, req, secHeaders)) return;
      // Dynamic hydration bundles (dev, or when not prebuilt): /_glash/<routeId>.js
      if (pathname.startsWith('/_glash/')) {
        const id = pathname.slice('/_glash/'.length).replace(/\.js$/, '');
        const comp = routes.find((r) => isComponentRoute(r.file) && routeId(r.file) === id);
        if (!comp) return send(res, 404, 'text/plain', 'not found', secHeaders);
        const js = await clientBundle(comp.file, findLayouts(routesDir, comp.file), dev);
        return send(res, 200, 'text/javascript; charset=utf-8', js, { ...secHeaders, 'cache-control': dev ? 'no-store' : 'public, max-age=31536000, immutable' });
      }
      const match = matchRoute(routes, pathname);
      if (!match) return send(res, 404, 'text/plain; charset=utf-8', 'Not found', secHeaders);
      const ctx = makeCtx(req, res, url, match.params);
      // Run the middleware chain (root -> leaf). Any return value short-circuits.
      for (const mwFile of findMiddleware(routesDir, match.route.file)) {
        const mwMod = await importRoute(mwFile);
        const mw = mwMod.default || mwMod.middleware;
        if (typeof mw !== 'function') continue;
        const result = await mw(ctx);
        if (result) return sendMiddlewareResult(res, result, secHeaders);
      }
      if (match.route.isApi) {
        const mod = await importRoute(match.route.file);
        return await handleApi(res, mod, req, ctx, secHeaders);
      }
      if (isComponentRoute(match.route.file)) {
        return await handleComponentPage(res, match.route, ctx, cfg, secHeaders, root, routesDir, dev);
      }
      const mod = await importRoute(match.route.file);
      return await handlePage(res, mod, ctx, cfg, secHeaders, dev);
    } catch (err) {
      const msg = dev ? `glashjs error:\n${err?.stack || err}` : 'Internal Server Error';
      send(res, 500, 'text/plain; charset=utf-8', msg, secHeaders);
    }
  });

  const listen = (port = cfg.port || 3000, host = '0.0.0.0') =>
    new Promise((resolve) => server.listen(port, host, () => resolve({ port, host })));

  return { server, listen, cfg, routes, routesDir, outDir };
}

async function handleApi(res, mod, req, ctx, secHeaders) {
  const method = req.method.toUpperCase();
  const handler = mod[method] || (method === 'GET' && mod.default) || mod.handler;
  if (typeof handler !== 'function') {
    return send(res, 405, 'application/json', JSON.stringify({ error: 'method not allowed' }), secHeaders);
  }
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) ctx.body = await readJson(req);
  const result = await handler(ctx);
  if (result && result.__response) {
    return send(res, result.status || 200, result.contentType || 'application/json',
      typeof result.body === 'string' ? result.body : JSON.stringify(result.body), { ...secHeaders, ...(result.headers || {}) });
  }
  send(res, 200, 'application/json', JSON.stringify(result ?? null), secHeaders);
}

async function handlePage(res, mod, ctx, cfg, secHeaders, dev) {
  const render = mod.default;
  if (typeof render !== 'function') return send(res, 500, 'text/plain', 'route has no default export', secHeaders);
  const out = await render(ctx);
  const page = typeof out === 'string' || (out && out.__raw) ? { body: out } : (out || {});
  const nonce = randomBytes(16).toString('base64');
  const meta = await resolveMeta(page.metadata || mod.metadata, ctx);
  const docHtml = renderDocument({
    title: meta.title || page.title || mod.title || cfg.name,
    head: renderMeta(meta) + (page.head ? (page.head.__raw || page.head) : ''),
    body: page.body ?? '',
    offline: cfg.offline,
    animatedFavicon: !!cfg.animatedFavicon,
    nonce, dev,
  });
  send(res, page.status || 200, 'text/html; charset=utf-8', docHtml, { ...pageHeaders(cfg, secHeaders, nonce), ...(page.headers || {}) });
}

async function handleComponentPage(res, route, ctx, cfg, secHeaders, root, routesDir, dev) {
  const layouts = findLayouts(routesDir, route.file);
  const mod = await loadComponentRoute(route.file, layouts, root, dev);
  const props = (typeof mod.getServerData === 'function' ? await mod.getServerData(ctx) : {}) || {};
  const id = routeId(route.file);
  const meta = await resolveMeta(mod.metadata, ctx);
  const title = meta.title || mod.title || cfg.name;

  // Client-side navigation: return the route as a partial (no full document),
  // so <Link> can swap #glash-root and re-hydrate without a full reload.
  if (String(ctx.headers['x-glash-nav'] || '') === '1') {
    const rendered = await renderComponent(mod, props);
    return send(res, 200, 'application/json', JSON.stringify({ title, html: rendered, props, bundle: `/_glash/${id}.js` }), secHeaders);
  }

  const nonce = randomBytes(16).toString('base64');
  // Props in a non-executed JSON block (CSP-safe); hydration bundle is an
  // external 'self' module — both pass the strict CSP without 'unsafe-inline'.
  const head = renderMeta(meta) + `<script type="application/json" id="glash-props">${safeJson(props)}</script>`;
  const { open, tail } = documentParts({
    title, head, offline: cfg.offline, animatedFavicon: !!cfg.animatedFavicon, nonce, dev,
  });
  res.writeHead(200, { ...pageHeaders(cfg, secHeaders, nonce), 'content-type': 'text/html; charset=utf-8' });
  res.write(open); // flush the shell first, before rendering the component
  const rendered = await renderComponent(mod, props);
  res.write(`<div id="glash-root">${rendered}</div><script type="module" src="/_glash/${id}.js"></script>`);
  res.end(tail);
}

// metadata export may be a plain object or a (ctx) => object function.
async function resolveMeta(metadata, ctx) {
  if (typeof metadata === 'function') return (await metadata(ctx)) || {};
  return metadata && typeof metadata === 'object' ? metadata : {};
}

// Per-request page headers: a fresh CSP carrying this request's script nonce, so
// the framework's own inline <script>s run while injected scripts stay blocked.
function pageHeaders(cfg, secHeaders, nonce) {
  const csp = securityHeaders({ ...(cfg.security || {}), csp: { ...((cfg.security || {}).csp || {}), nonce } })['Content-Security-Policy'];
  return { ...secHeaders, 'Content-Security-Policy': csp };
}

// Serialize props for inline injection without breaking out of the <script>.
function safeJson(value) {
  return JSON.stringify(value ?? {}).replace(/</g, '\\u003c').replace(/-->/g, '--\\u003e');
}

async function serveStatic(res, outDir, pathname, req, secHeaders) {
  if (pathname === '/') return false; // let the index page route render
  const rel = pathname.replace(/^\/+/, '');
  const file = path.join(outDir, rel);
  if (!file.startsWith(outDir + path.sep)) return false; // path traversal guard
  const ae = String(req.headers['accept-encoding'] || '');
  if (ae.includes('br') && existsSync(file + '.br')) {
    const buf = await fs.readFile(file + '.br');
    res.writeHead(200, { ...secHeaders, 'content-type': mime(file), 'content-encoding': 'br', 'cache-control': 'public, max-age=31536000, immutable' });
    res.end(buf);
    return true;
  }
  if (existsSync(file) && statSync(file).isFile()) {
    const buf = await fs.readFile(file);
    res.writeHead(200, { ...secHeaders, 'content-type': mime(file), 'cache-control': 'public, max-age=3600' });
    res.end(buf);
    return true;
  }
  return false;
}

function makeCtx(req, res, url, params) {
  return {
    req,
    res,
    method: req.method,
    url,
    path: url.pathname,
    params,
    query: Object.fromEntries(url.searchParams),
    headers: req.headers,
    body: undefined,
  };
}

function readJson(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 2_000_000) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

function send(res, status, contentType, body, headers = {}) {
  res.writeHead(status, { ...headers, 'content-type': contentType });
  res.end(body);
}

function safeDecode(p) {
  try { return decodeURIComponent(p); } catch { return p; }
}

/** API helper: return a typed Response from a handler. */
export function json(body, { status = 200, headers } = {}) {
  return { __response: true, status, contentType: 'application/json', body, headers };
}

/** Middleware/handler helper: redirect to another path. */
export function redirect(location, { status = 302 } = {}) {
  return { __redirect: location, status };
}

function sendMiddlewareResult(res, result, secHeaders) {
  if (result.__redirect) {
    res.writeHead(result.status || 302, { ...secHeaders, location: result.__redirect });
    return res.end();
  }
  if (result.__response) {
    return send(res, result.status || 200, result.contentType || 'application/json',
      typeof result.body === 'string' ? result.body : JSON.stringify(result.body), { ...secHeaders, ...(result.headers || {}) });
  }
  // A bare object/string from middleware is treated as a JSON/text body.
  if (typeof result === 'string') return send(res, 200, 'text/plain; charset=utf-8', result, secHeaders);
  return send(res, 200, 'application/json', JSON.stringify(result), secHeaders);
}
