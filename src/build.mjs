// glashjs build orchestrator
// Ties the pieces together: optimize assets -> derive a content version ->
// generate the offline Service Worker + PWA manifest -> emit security headers
// + a deploy manifest the glashdb edge (or any server) can consume.
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { optimizeAssets } from './assets/optimize.mjs';
import { generateAnimatedFavicon } from './assets/animated-favicon.mjs';
import { generateServiceWorker } from './offline/generate-sw.mjs';
import { securityHeaders } from './security/headers.mjs';
import { discoverRoutes } from './server/router.mjs';
import { isComponentRoute, findLayouts, loadComponentRoute, clientBundle, routeId } from './server/jsx.mjs';
import { loadConfig } from './config.mjs';

// Precompile JSX routes: server modules (-> .glash/server) + minified client
// hydration bundles (-> outDir/_glash/<id>.js). Production `glash serve` then
// serves bundles statically and imports prebuilt server modules — no esbuild
// on the serving host's hot path.
async function buildRoutes(root, cfg, outDir, log) {
  const routesDir = path.resolve(root, cfg.routesDir || 'routes');
  if (!existsSync(routesDir)) return { compiled: 0 };
  const routes = await discoverRoutes(routesDir);
  const comp = routes.filter((r) => isComponentRoute(r.file));
  if (!comp.length) return { compiled: 0 };
  const bundleDir = path.join(outDir, '_glash');
  await fs.mkdir(bundleDir, { recursive: true });
  for (const r of comp) {
    const layouts = findLayouts(routesDir, r.file);
    await loadComponentRoute(r.file, layouts, root, false, true);
    const js = await clientBundle(r.file, layouts, false);
    await fs.writeFile(path.join(bundleDir, routeId(r.file) + '.js'), js);
    log(`  route  ${r.pattern}  ->  _glash/${routeId(r.file)}.js`);
  }
  return { compiled: comp.length };
}

function deriveVersion(manifest) {
  const h = createHash('sha256');
  for (const [rel, entry] of Object.entries(manifest.assets)) h.update(rel + ':' + entry.hash);
  return h.digest('hex').slice(0, 12);
}

function pwaManifest(cfg, version) {
  return {
    name: cfg.name,
    short_name: cfg.shortName ?? cfg.name,
    start_url: '/',
    display: 'standalone',
    background_color: cfg.themeColor ?? '#0b0d12',
    theme_color: cfg.themeColor ?? '#0b0d12',
    icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
    version,
  };
}

export async function build({ root = process.cwd(), log = console.log } = {}) {
  const cfg = await loadConfig(root);
  const publicDir = path.resolve(root, cfg.publicDir);
  const outDir = path.resolve(root, cfg.outDir);

  log(`\nglashjs build — "${cfg.name}"`);
  log(`  public: ${path.relative(root, publicDir)}  ->  out: ${path.relative(root, outDir)}\n`);

  // A routes-only app may have no public/ dir — that's fine, just skip assets.
  let manifest;
  if (existsSync(publicDir)) {
    log('Optimizing assets:');
    manifest = await optimizeAssets(publicDir, { log });
  } else {
    log(`(no ${cfg.publicDir}/ dir — skipping asset optimization)`);
    manifest = { totals: { assets: 0, originalBytes: 0, optimizedBytes: 0, savedPercent: 0 }, assets: {} };
  }
  const version = deriveVersion(manifest);
  manifest.version = version;
  manifest.generatedAt = new Date().toISOString();

  await fs.mkdir(outDir, { recursive: true });

  // Precompile JSX routes (server modules + client bundles) for production.
  let routesBuilt = { compiled: 0 };
  try {
    log('\nCompiling routes:');
    routesBuilt = await buildRoutes(root, cfg, outDir, log);
    if (!routesBuilt.compiled) log('  (no JSX routes)');
  } catch (error) {
    log(`  ! route compile skipped: ${(error instanceof Error ? error.message : error)}`);
  }

  // Offline Service Worker + registration helper.
  const offline = cfg.offline
    ? await generateServiceWorker(outDir, manifest, { dataPrefixes: cfg.dataPrefixes })
    : { precached: 0, serviceWorker: null };

  // PWA manifest + favicon (static + animated).
  await fs.writeFile(path.join(outDir, 'manifest.webmanifest'), JSON.stringify(pwaManifest(cfg, version), null, 2));
  await copyFavicon(cfg, root, outDir, log);
  const animated = await generateAnimatedFavicon(outDir, cfg, root, log);

  // Asset + deploy manifests for the edge/server to serve best variants.
  await fs.writeFile(path.join(outDir, 'glash-assets.manifest.json'), JSON.stringify(manifest, null, 2));
  await fs.writeFile(path.join(outDir, 'glash-headers.json'), JSON.stringify(securityHeaders(cfg.security), null, 2));

  const t = manifest.totals;
  log('\nSummary');
  log(`  assets        ${t.assets}`);
  log(`  original      ${kb(t.originalBytes)}`);
  log(`  optimized     ${kb(t.optimizedBytes)}`);
  log(`  saved         ${t.savedPercent}%  (${kb(t.originalBytes - t.optimizedBytes)})`);
  log(`  routes        ${routesBuilt.compiled} JSX route(s) precompiled (no runtime esbuild in prod)`);
  log(`  offline       ${cfg.offline ? `${offline.precached} files precached (works offline after first visit)` : 'disabled'}`);
  log(`  favicon       static glashdb logo${animated.enabled ? ' + animated (glash-favicon.mjs)' : ''}`);
  log(`  version       ${version}`);
  log(`  security      strict CSP + ${Object.keys(securityHeaders(cfg.security)).length} headers\n`);

  return { manifest, version, offline };
}

// The preview favicon defaults to the official glashdb logo bundled with the
// framework. Try the configured path first, then fall back to that bundled logo
// so the glashdb favicon shows out-of-the-box even before any override.
async function copyFavicon(cfg, root, outDir, log) {
  const bundled = path.resolve(fileURLToPath(new URL('../templates/favicon.svg', import.meta.url)));
  const candidates = [path.resolve(root, cfg.favicon), bundled];
  for (const src of candidates) {
    try {
      await fs.copyFile(src, path.join(outDir, 'favicon.svg'));
      return;
    } catch { /* try next */ }
  }
  log(`  ! favicon not found (looked in ${cfg.favicon}, bundled glashdb logo) — preview favicon will be missing`);
}

function kb(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
