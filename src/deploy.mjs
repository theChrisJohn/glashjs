// glashjs deploy -> glashdb
// ---------------------------------------------------------------------------
// One command from a glashjs app to live on glashdb. It does the glashjs-aware
// part (production build + deployable package.json scripts) and then hands off
// to the existing glashdb CLI (npm: `glashdb`) for upload/auth — no duplicated
// deploy logic. The platform then runs `glash build` + `glash serve`.
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { build } from './build.mjs';

/** Ensure the app declares the scripts the glashdb platform runs to build/serve it. */
async function ensureDeployScripts(root, log) {
  const pkgPath = path.join(root, 'package.json');
  let pkg;
  try { pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8')); } catch { return; }
  pkg.scripts = pkg.scripts || {};
  let changed = false;
  if (!pkg.scripts.build) { pkg.scripts.build = 'glash build'; changed = true; }
  if (!pkg.scripts.start) { pkg.scripts.start = 'glash serve'; changed = true; }
  if (changed) {
    await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    log('  + added build/start scripts to package.json (glash build / glash serve)');
  }
}

export async function deploy({ root = process.cwd(), dryRun = false, args = [], log = console.log } = {}) {
  log('glashjs deploy -> glashdb\n');

  // 1. Production build (optimize assets, precompile routes, SW, security).
  await build({ root, log });

  // 2. Make sure the platform knows how to build/run the app.
  log('');
  await ensureDeployScripts(root, log);

  // 3. Hand off to the glashdb CLI (zips + uploads, handles login).
  const cmd = 'npx';
  const cmdArgs = ['-y', 'glashdb', 'deploy', ...args];
  log(`\nHanding off to the glashdb CLI:\n  $ ${cmd} ${cmdArgs.join(' ')}\n`);
  if (dryRun) {
    log('(dry run — build complete, not uploading)');
    return { handoff: `${cmd} ${cmdArgs.join(' ')}`, dryRun: true };
  }
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, { cwd: root, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve({ code }) : reject(new Error(`glashdb deploy exited with code ${code}`))));
  });
}
