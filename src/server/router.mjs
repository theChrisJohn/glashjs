// glashjs file-based router
// ---------------------------------------------------------------------------
// Maps files under the routes/ dir to URL patterns, Next-style:
//   routes/index.mjs          -> /
//   routes/about.mjs          -> /about
//   routes/blog/[slug].mjs    -> /blog/:slug      (dynamic segment)
//   routes/docs/[...path].mjs -> /docs/*path       (catch-all)
//   routes/api/hello.mjs      -> /api/hello        (API route — exports GET/POST/…)
// Anything under routes/api/ is an API route; everything else is a page (SSR).
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * File-based middleware: `_middleware.{mjs,js}` in any routes dir runs before
 * the route, root→leaf. Each default-exports `(ctx) => Response | void` — return
 * a value to short-circuit (redirect/auth/json), or nothing to continue. The
 * root middleware runs for every request; `dash/_middleware` only for /dash/*.
 */
export function findMiddleware(routesDir, routeFile) {
  const root = path.resolve(routesDir);
  const dir = path.dirname(path.resolve(routeFile));
  const rel = path.relative(root, dir);
  const dirs = [root];
  let acc = root;
  for (const part of rel ? rel.split(path.sep) : []) { acc = path.join(acc, part); dirs.push(acc); }
  const files = [];
  for (const d of dirs) {
    for (const name of ['_middleware.mjs', '_middleware.js']) {
      const f = path.join(d, name);
      if (existsSync(f)) { files.push(f); break; }
    }
  }
  return files;
}

export async function discoverRoutes(routesDir) {
  const root = path.resolve(routesDir);
  const files = [];
  await walk(root, root, files);
  const routes = files
    .filter((f) => /\.(mjs|js|jsx|tsx|ts)$/.test(f.rel))
    .filter((f) => !/\.d\.ts$/.test(f.rel))
    // `_`-prefixed files are private (layouts, helpers) — not routes.
    .filter((f) => !f.rel.split('/').some((seg) => seg.startsWith('_')))
    .map((f) => toRoute(f.rel, f.file));
  // Most specific first: static segments beat params beat catch-all.
  routes.sort((a, b) => b.score - a.score);
  return routes;
}

async function walk(root, dir, out) {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(root, full, out);
    else if (e.isFile()) out.push({ file: full, rel: path.relative(root, full).split(path.sep).join('/') });
  }
}

function toRoute(rel, file) {
  const clean = rel.replace(/\.(mjs|js|jsx|tsx|ts)$/, '');
  const isApi = clean === 'api' || clean.startsWith('api/');
  const segs = [];
  for (const part of clean.split('/').filter(Boolean)) {
    if (part === 'index') continue;
    if (part.startsWith('[...') && part.endsWith(']')) segs.push({ type: 'catchall', name: part.slice(4, -1) });
    else if (part.startsWith('[') && part.endsWith(']')) segs.push({ type: 'param', name: part.slice(1, -1) });
    else segs.push({ type: 'static', value: part });
  }
  const pattern = '/' + segs.map((s) => (s.type === 'static' ? s.value : s.type === 'param' ? `:${s.name}` : `*${s.name}`)).join('/');
  const score = segs.reduce((acc, s) => acc + (s.type === 'static' ? 3 : s.type === 'param' ? 2 : 1), 0) * 10 + segs.length;
  return { file, isApi, segs, pattern: pattern === '/' ? '/' : pattern, score };
}

export function matchRoute(routes, pathname) {
  const reqSegs = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  for (const route of routes) {
    const params = matchSegs(route.segs, reqSegs);
    if (params) return { route, params };
  }
  return null;
}

function matchSegs(segs, reqSegs) {
  const params = {};
  let i = 0;
  for (const seg of segs) {
    if (seg.type === 'catchall') {
      params[seg.name] = reqSegs.slice(i).map(decodeURIComponent).join('/');
      return params;
    }
    if (i >= reqSegs.length) return null;
    if (seg.type === 'static') {
      if (reqSegs[i] !== seg.value) return null;
    } else {
      params[seg.name] = decodeURIComponent(reqSegs[i]);
    }
    i++;
  }
  return i === reqSegs.length ? params : null;
}
