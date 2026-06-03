// glashjs configuration
// Define a `glash.config.mjs` at your project root:
//
//   import { defineConfig } from 'glashjs/config';
//   export default defineConfig({ name: 'My Site', publicDir: 'public' });
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_CONFIG = {
  name: 'glash app',
  shortName: undefined,
  // The preview favicon defaults to the official glashdb logo shipped with the
  // framework; override with your own path relative to the project root.
  favicon: 'node_modules/glashjs/templates/favicon.svg',
  // Animated favicon: true = bundled animated glash mark, a path to your own
  // animated SVG/GIF, or { frames: ['/f0.svg', ...], fps: 8 } to cycle frames.
  // false disables it. Emits `glash-favicon.mjs` — call startGlashFavicon() once.
  animatedFavicon: true,
  publicDir: 'public',
  // File-based routes (pages + api/) served by `glash dev` / `glash serve`.
  routesDir: 'routes',
  port: 3000,
  outDir: '.glash/out',
  themeColor: '#0b0d12',
  offline: true,
  // Requests under these prefixes are treated as live/updated data: network-first
  // in the Service Worker, so offline mode degrades exactly there (no stale live data).
  dataPrefixes: ['/api/', '/rest/', '/auth/', '/realtime', '/live', '/stream'],
  security: {},
};

export function defineConfig(config) {
  return { ...DEFAULT_CONFIG, ...config };
}

export async function loadConfig(root = process.cwd()) {
  for (const name of ['glash.config.mjs', 'glash.config.js']) {
    const file = path.resolve(root, name);
    try {
      const mod = await import(pathToFileURL(file).href);
      const cfg = mod.default ?? mod.config ?? {};
      return { ...DEFAULT_CONFIG, ...cfg };
    } catch (err) {
      if (err?.code !== 'ERR_MODULE_NOT_FOUND' && !String(err?.message).includes('Cannot find module')) throw err;
    }
  }
  return { ...DEFAULT_CONFIG };
}
