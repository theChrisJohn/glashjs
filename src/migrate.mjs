// glashjs migrate — convert a Next.js project to glashjs conventions.
// ---------------------------------------------------------------------------
// Honest scope: this does the MECHANICAL migration (file/route mapping, import
// rewrites, config + scripts) and writes a MIGRATION.md report listing exactly
// what still needs hands-on porting (RSC/server actions/SSG/next-specific APIs).
// It never deletes your Next code — it scaffolds `routes/` alongside it.
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';

const PAGE_EXT = /\.(tsx|jsx|ts|js)$/;

// next import -> glashjs equivalent (safe, mechanical rewrites)
const IMPORT_REWRITES = [
  [/(['"])next\/link\1/g, "'glashjs/link'"],
  [/(['"])next\/image\1/g, "'glashjs/image'"],
];

// patterns that need a human — surfaced in the report, not silently "fixed"
const MANUAL = [
  [/from\s+['"]next\/navigation['"]/, 'next/navigation (useRouter/usePathname/redirect) → glashjs <Link> + redirect() + ctx.url'],
  [/from\s+['"]next\/headers['"]/, 'next/headers (cookies/headers) → read ctx.headers in getServerData / API handlers'],
  [/from\s+['"]next\/font/, 'next/font → load fonts via <link rel="preload"> or CSS @font-face'],
  [/getServerSideProps/, 'getServerSideProps → rename to `export function getServerData(ctx)` (same role)'],
  [/getStaticProps|getStaticPaths/, 'getStaticProps/Paths (SSG) → use getServerData (SSR) or precompute at build'],
  [/['"]use server['"]/, 'Server Actions ("use server") → port to a glashjs API route (routes/api/*)'],
  [/createServerClient|auth\.getUser\(\)|supabase\.auth/, 'Supabase server auth → re-wire via glashjs _middleware.mjs + API routes'],
  [/export\s+const\s+(dynamic|revalidate|fetchCache)/, 'Route segment config (dynamic/revalidate) → handle in getServerData / cache headers'],
];

function srcDirs(root) {
  // Next supports app/ or pages/, optionally under src/.
  const bases = ['app', 'pages', 'src/app', 'src/pages'];
  return bases.map((b) => path.join(root, b)).filter(existsSync);
}

async function walk(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

// app/ route folder -> URL path (strip page/route/layout file, route groups
// "(grp)", keep [param]). Handles root-level files (no leading slash) too.
function appPath(rel) {
  let p = rel.replace(/\\/g, '/').replace(/(^|\/)(page|route|layout)\.(tsx|jsx|ts|js)$/, '');
  p = p.split('/').filter((seg) => seg && !(seg.startsWith('(') && seg.endsWith(')'))).join('/');
  return p;
}

// Map one Next file -> { to, kind } in glashjs routes/, or null to skip.
function mapFile(rel, router) {
  const base = path.basename(rel);
  if (router === 'app') {
    if (/^page\.(tsx|jsx|ts|js)$/.test(base)) {
      const p = appPath(rel); return { to: `routes/${p || 'index'}.tsx`, kind: 'page' };
    }
    if (/^layout\.(tsx|jsx|ts|js)$/.test(base)) {
      const p = appPath(rel); return { to: `routes/${p ? p + '/' : ''}_layout.tsx`, kind: 'layout' };
    }
    if (/^route\.(ts|js)$/.test(base)) {
      const p = appPath(rel); const api = p.startsWith('api/') ? p : `api/${p}`; return { to: `routes/${api}.ts`, kind: 'api' };
    }
    return null;
  }
  // pages/ router
  if (rel.startsWith('api/')) {
    const p = rel.replace(PAGE_EXT, ''); return { to: `routes/${p}.ts`, kind: 'api' };
  }
  if (base.startsWith('_app') || base.startsWith('_document')) {
    return { to: `routes/_layout.tsx`, kind: 'layout' };
  }
  let p = rel.replace(PAGE_EXT, '').replace(/\/index$/, '');
  if (p === 'index') p = '';
  return { to: `routes/${p ? p : 'index'}.tsx`, kind: 'page' };
}

function transform(code, kind) {
  let out = code;
  const notes = [];
  // strip the "use client" directive (glashjs hydrates components by default)
  out = out.replace(/^\s*['"]use client['"];?\s*\n/m, '');
  for (const [re, to] of IMPORT_REWRITES) out = out.replace(re, to);
  // getServerSideProps -> getServerData (best-effort rename of the export)
  out = out.replace(/export\s+(async\s+)?function\s+getServerSideProps/, 'export $1function getServerData');
  for (const [re, msg] of MANUAL) if (re.test(code)) notes.push(msg);
  const header = `// ⤷ auto-migrated from Next.js by \`glashjs migrate\`. Review TODOs below.\n` +
    (notes.length ? notes.map((n) => `// TODO(glashjs): ${n}`).join('\n') + '\n' : '');
  return { code: header + out, notes };
}

export async function migrate({ root = process.cwd(), dryRun = false, log = console.log } = {}) {
  const dirs = srcDirs(root);
  if (!dirs.length) {
    log('No Next.js app/ or pages/ directory found — nothing to migrate.');
    return { migrated: 0 };
  }
  log(`glashjs migrate ${dryRun ? '(dry run) ' : ''}— scanning ${dirs.map((d) => path.relative(root, d)).join(', ')}\n`);

  const report = [];
  let migrated = 0;
  const manualItems = new Set();

  for (const dir of dirs) {
    const router = path.basename(dir) === 'app' ? 'app' : 'pages';
    for (const file of await walk(dir)) {
      if (!PAGE_EXT.test(file)) continue;
      const rel = path.relative(dir, file).replace(/\\/g, '/');
      const mapped = mapFile(rel, router);
      if (!mapped) continue;
      const target = path.join(root, mapped.to);
      const src = await fs.readFile(file, 'utf8');
      const { code, notes } = transform(src, mapped.kind);
      notes.forEach((n) => manualItems.add(n));
      if (!dryRun) {
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, code);
      }
      migrated += 1;
      report.push({ from: `${router}/${rel}`, to: mapped.to, kind: mapped.kind, notes });
      log(`  ${mapped.kind.padEnd(6)} ${router}/${rel}  →  ${mapped.to}${notes.length ? `  (${notes.length} TODO)` : ''}`);
    }
  }

  if (!dryRun) {
    await ensureConfigAndScripts(root, log);
    await writeReport(root, report, manualItems);
  }

  log(`\n${migrated} file(s) ${dryRun ? 'would be' : ''} migrated → routes/`);
  log(`${manualItems.size} pattern(s) need manual porting — see MIGRATION.md`);
  log('\nNext steps:');
  log('  npm i glashjs preact preact-render-to-string esbuild');
  log('  glashjs dev      # then work through the TODOs in the migrated files');
  return { migrated, manual: manualItems.size };
}

async function ensureConfigAndScripts(root, log) {
  const cfgPath = path.join(root, 'glash.config.mjs');
  if (!existsSync(cfgPath)) {
    await fs.writeFile(cfgPath, `import { defineConfig } from 'glashjs/config';\n\nexport default defineConfig({\n  name: 'Migrated app',\n  routesDir: 'routes',\n  offline: true,\n});\n`);
    log('  + glash.config.mjs');
  }
  const pkgPath = path.join(root, 'package.json');
  try {
    const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
    pkg.scripts = pkg.scripts || {};
    pkg.scripts['glash:dev'] = 'glashjs dev';
    pkg.scripts['glash:build'] = 'glashjs build';
    pkg.scripts['glash:start'] = 'glashjs serve';
    await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    log('  + package.json scripts (glash:dev / glash:build / glash:start)');
  } catch { /* no package.json */ }
}

async function writeReport(root, report, manualItems) {
  const lines = ['# Next.js → glashjs migration report', '',
    `Auto-migrated **${report.length}** files into \`routes/\`. Your original Next code was left untouched.`, '',
    '## Files migrated', '', '| Next | glashjs | kind | TODOs |', '|---|---|---|---|'];
  for (const r of report) lines.push(`| \`${r.from}\` | \`${r.to}\` | ${r.kind} | ${r.notes.length} |`);
  lines.push('', '## Needs manual porting', '');
  if (manualItems.size) for (const m of manualItems) lines.push(`- ${m}`);
  else lines.push('- Nothing detected — but review the migrated components in a browser.');
  lines.push('', '## Next.js → glashjs cheatsheet', '',
    '| Next.js | glashjs |', '|---|---|',
    '| `app/page.tsx` | `routes/index.tsx` |',
    '| `app/blog/[slug]/page.tsx` | `routes/blog/[slug].tsx` |',
    '| `app/layout.tsx` | `routes/_layout.tsx` |',
    '| `app/api/x/route.ts` (GET/POST) | `routes/api/x.ts` (export GET/POST) |',
    '| `middleware.ts` | `routes/_middleware.mjs` |',
    '| `getServerSideProps` | `export function getServerData(ctx)` |',
    '| `next/link` | `glashjs/link` |',
    '| `next/image` | `glashjs/image` |',
    '| `useRouter().push` | `<Link>` / `redirect()` |', '');
  await fs.writeFile(path.join(root, 'MIGRATION.md'), lines.join('\n'));
}
