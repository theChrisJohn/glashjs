#!/usr/bin/env node
// glashjs CLI
import { readFileSync } from 'node:fs';
import os from 'node:os';
import { build } from '../src/build.mjs';
import { optimizeAssets } from '../src/assets/optimize.mjs';
import { createGlashServer } from '../src/server/server.mjs';
import { deploy } from '../src/deploy.mjs';
import { update } from '../src/update.mjs';

const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const [, , cmd, ...rest] = process.argv;

function arg(name, fallback) {
  const i = rest.indexOf(name);
  return i >= 0 && rest[i + 1] ? rest[i + 1] : fallback;
}

// LAN IPv4 addresses, so the dev server prints a Network URL you can open from
// your phone or another device on the same network.
function lanAddresses() {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const i of ifaces[name] || []) {
      if (i.family === 'IPv4' && !i.internal) out.push(i.address);
    }
  }
  return out;
}

async function serve(dev) {
  const root = arg('--root', process.cwd());
  const { listen, cfg, routes } = await createGlashServer({ root, dev });
  const port = Number(arg('--port', cfg.port || 3000));
  await listen(port);
  const pages = routes.filter((r) => !r.isApi).length;
  const apis = routes.filter((r) => r.isApi).length;
  console.log(`\nglashjs ${dev ? 'dev' : 'serve'} — "${cfg.name}"`);
  console.log(`  ${pages} page route(s), ${apis} api route(s)`);
  routes.forEach((r) => console.log(`    ${r.isApi ? 'api ' : 'page'}  ${r.pattern}`));
  console.log('');
  console.log(`  ➜ Local:    http://localhost:${port}`);
  for (const ip of lanAddresses()) console.log(`  ➜ Network:  http://${ip}:${port}   (preview on other devices)`);
  if (dev) console.log('\n  live reload on save · ctrl-c to stop');
  console.log('');
}

async function main() {
  switch (cmd) {
    case 'build': {
      await build({ root: arg('--root', process.cwd()) });
      break;
    }
    case 'deploy': {
      const passthrough = rest.filter((a, i) => a !== '--dry-run' && a !== '--root' && rest[i - 1] !== '--root');
      await deploy({ root: arg('--root', process.cwd()), dryRun: rest.includes('--dry-run'), args: passthrough });
      break;
    }
    case 'update':
    case 'upgrade':
      await update({ root: arg('--root', process.cwd()) });
      break;
    case 'dev':
      await serve(true);
      break;
    case 'serve':
    case 'start':
      await serve(false);
      break;
    case 'optimize': {
      const dir = rest[0] && !rest[0].startsWith('--') ? rest[0] : 'public';
      console.log(`glashjs optimize — ${dir}\n`);
      const manifest = await optimizeAssets(dir, { log: console.log });
      const t = manifest.totals;
      console.log(`\n${t.assets} assets · ${t.savedPercent}% smaller (${(t.originalBytes / 1024).toFixed(1)} KB -> ${(t.optimizedBytes / 1024).toFixed(1)} KB)`);
      break;
    }
    case 'version':
    case '--version':
    case '-v':
      console.log('glashjs ' + VERSION);
      break;
    default:
      console.log(`glashjs — fast, offline-capable, hard-to-hack sites

Usage:
  glash dev [--port 3000]       Run the dev server (file-based routing, SSR, API, live reload)
  glash serve [--port 3000]     Run the production server over routes/ + built assets
  glash build [--root <dir>]    Optimize assets, generate offline SW + PWA + security manifests
  glash deploy [--dry-run]      Build, then deploy to glashdb (hands off to the glashdb CLI)
  glash update                  Update glashjs to the latest published version
  glash optimize [<dir>]        Just run the asset optimizer over a directory
  glash version                 Print version

Docs: ./README.md`);
  }
}

main().catch((err) => { console.error('glashjs error:', err?.message ?? err); process.exit(1); });
