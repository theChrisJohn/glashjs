// glashjs JSX + hydration engine
// ---------------------------------------------------------------------------
// This is the layer that makes glashjs a real Next.js alternative: author
// pages as JSX components, render them on the server, and HYDRATE them in the
// browser so hooks (useState/useEffect) work — true interactivity.
//
// Built on proven primitives, added as OPTIONAL peers so glashjs core stays
// zero-dependency:
//   - esbuild                  -> compiles JSX/TSX (server module + client bundle)
//   - preact                   -> the component runtime (React-compatible)
//   - preact-render-to-string  -> server-side rendering
//
// A `.jsx`/`.tsx` route exports a default component and (optionally) an async
// `getServerData(ctx)` that returns props for SSR + hydration. Plain `.mjs`
// HTML-render routes keep working with zero deps.
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const MISSING = 'JSX/TSX routes need the optional peers: npm i esbuild preact preact-render-to-string';

let _esbuild;
async function esbuild() {
  if (_esbuild !== undefined) return _esbuild;
  try { _esbuild = await import('esbuild'); } catch { _esbuild = null; }
  return _esbuild;
}

let _h, _renderToString;
async function preactRuntime() {
  if (_h) return { h: _h, renderToString: _renderToString };
  const p = await import('preact').catch(() => null);
  const r = await import('preact-render-to-string').catch(() => null);
  if (!p || !r) return null;
  _h = p.h;
  _renderToString = r.renderToString || r.default;
  return { h: _h, renderToString: _renderToString };
}

export function isComponentRoute(file) {
  return /\.(jsx|tsx)$/.test(file);
}

export function routeId(file) {
  return createHash('sha1').update(file).digest('hex').slice(0, 10);
}

const serverCache = new Map();
const clientCache = new Map();

/** Clear compiled-route caches (used by dev live-reload on file change). */
export function clearJsxCaches() {
  serverCache.clear();
  clientCache.clear();
}

/**
 * Nested layouts: collect `_layout.{jsx,tsx}` from the routes root down to the
 * page's directory (root-first). Each wraps its children, Next-style.
 */
export function findLayouts(routesDir, pageFile) {
  const root = path.resolve(routesDir);
  const pageDir = path.dirname(path.resolve(pageFile));
  const rel = path.relative(root, pageDir);
  const dirs = [root];
  let acc = root;
  for (const part of rel ? rel.split(path.sep) : []) { acc = path.join(acc, part); dirs.push(acc); }
  const layouts = [];
  for (const d of dirs) {
    for (const name of ['_layout.jsx', '_layout.tsx']) {
      const f = path.join(d, name);
      if (existsSync(f)) { layouts.push(f); break; }
    }
  }
  return layouts;
}

const compId = (pageFile, layouts) => routeId(pageFile + '|' + layouts.join('|'));

function serverEntry(pageFile, layouts) {
  const lines = [`import * as __p from ${JSON.stringify(pageFile)};`];
  layouts.forEach((f, i) => lines.push(`import __L${i} from ${JSON.stringify(f)};`));
  lines.push('export const Page = __p.default;', 'export const getServerData = __p.getServerData;', 'export const title = __p.title;', 'export const metadata = __p.metadata;');
  lines.push(`export const layouts = [${layouts.map((_, i) => `__L${i}`).join(',')}];`);
  return lines.join('\n');
}

function clientEntry(pageFile, layouts) {
  const imports = [`import { hydrate, h } from 'preact';`, `import Page from ${JSON.stringify(pageFile)};`];
  layouts.forEach((f, i) => imports.push(`import __L${i} from ${JSON.stringify(f)};`));
  return `${imports.join('\n')}
const layouts = [${layouts.map((_, i) => `__L${i}`).join(',')}];
const el = document.getElementById('glash-root');
const pe = document.getElementById('glash-props');
let props = {};
try { props = pe ? JSON.parse(pe.textContent) : {}; } catch {}
let tree = h(Page, props);
for (let i = layouts.length - 1; i >= 0; i--) tree = h(layouts[i], props, tree);
if (el) hydrate(tree, el);`;
}

/** Compile page + its layout chain into a server module ({ Page, layouts, getServerData, title }). */
export async function loadComponentRoute(pageFile, layouts, root, dev, force = false) {
  const id = compId(pageFile, layouts);
  if (!dev && serverCache.has(id)) return serverCache.get(id);
  const out = path.join(root, '.glash', 'server', id + '.mjs');
  // Production: if `glash build` already precompiled this module, import it
  // directly — no esbuild needed on the serving host.
  if (!dev && !force && existsSync(out)) {
    const mod = await import(pathToFileURL(out).href);
    serverCache.set(id, mod);
    return mod;
  }
  const eb = await esbuild();
  if (!eb) throw new Error(MISSING);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await eb.build({
    stdin: { contents: serverEntry(pageFile, layouts), resolveDir: path.dirname(pageFile), loader: 'js', sourcefile: 'glash-server-entry.js' },
    bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', jsxImportSource: 'preact',
    external: ['preact', 'preact/*', 'preact-render-to-string'],
    outfile: out, logLevel: 'silent',
  });
  const mod = await import(pathToFileURL(out).href + (dev ? `?t=${Date.now()}` : ''));
  if (!dev) serverCache.set(id, mod);
  return mod;
}

/** Build the browser hydration bundle for page + layouts (preact bundled in). */
export async function clientBundle(pageFile, layouts, dev) {
  const eb = await esbuild();
  if (!eb) throw new Error(MISSING);
  const id = compId(pageFile, layouts);
  if (!dev && clientCache.has(id)) return clientCache.get(id);
  const res = await eb.build({
    stdin: { contents: clientEntry(pageFile, layouts), resolveDir: path.dirname(pageFile), loader: 'jsx', sourcefile: 'glash-client-entry.jsx' },
    bundle: true, platform: 'browser', format: 'esm', minify: !dev, jsx: 'automatic', jsxImportSource: 'preact',
    write: false, logLevel: 'silent',
  });
  const js = res.outputFiles[0].text;
  if (!dev) clientCache.set(id, js);
  return js;
}

function compose(h, layouts, Page, props) {
  let tree = h(Page, props);
  for (let i = layouts.length - 1; i >= 0; i--) tree = h(layouts[i], props, tree);
  return tree;
}

/** Server-render page + layouts to an HTML string. */
export async function renderComponent(mod, props) {
  const rt = await preactRuntime();
  if (!rt) throw new Error(MISSING);
  if (typeof mod.Page !== 'function') throw new Error('JSX route must default-export a component');
  return rt.renderToString(compose(rt.h, mod.layouts || [], mod.Page, props));
}
