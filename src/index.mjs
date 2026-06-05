// glashjs public API
export { defineConfig, loadConfig, DEFAULT_CONFIG } from './config.mjs';
export { build } from './build.mjs';
export { deploy } from './deploy.mjs';
export { update } from './update.mjs';
export { migrate } from './migrate.mjs';
export { optimizeAssets } from './assets/optimize.mjs';
export { generateAnimatedFavicon } from './assets/animated-favicon.mjs';
export { generateServiceWorker } from './offline/generate-sw.mjs';
export { securityHeaders, buildCsp, sri, glashSecurity } from './security/headers.mjs';
export { createGlashServer, json, redirect } from './server/server.mjs';
export { discoverRoutes, matchRoute, findMiddleware } from './server/router.mjs';
export { html, raw, escapeHtml, renderDocument, renderMeta } from './server/html.mjs';
// NOTE: <Image>/<Video>/<Link> are Preact components, so they live on subpaths
// (glashjs/image, glashjs/video, glashjs/link) and are NOT re-exported here —
// otherwise importing anything from 'glashjs' would require preact to be
// installed, breaking the zero-dependency core (html/json/createGlashServer/build).
