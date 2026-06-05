// glashjs update — bump the installed glashjs to the latest published version,
// using whichever package manager the project uses (npm/pnpm/yarn/bun).
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

function installedVersion(root) {
  try {
    return JSON.parse(readFileSync(path.join(root, 'node_modules/glashjs/package.json'), 'utf8')).version;
  } catch {
    return null;
  }
}

function packageManager(root) {
  if (existsSync(path.join(root, 'pnpm-lock.yaml'))) return { cmd: 'pnpm', args: ['add', 'glashjs@latest'] };
  if (existsSync(path.join(root, 'yarn.lock'))) return { cmd: 'yarn', args: ['add', 'glashjs@latest'] };
  if (existsSync(path.join(root, 'bun.lockb'))) return { cmd: 'bun', args: ['add', 'glashjs@latest'] };
  return { cmd: 'npm', args: ['install', 'glashjs@latest'] };
}

function run(cmd, args, root) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with code ${code}`))));
  });
}

export async function update({ root = process.cwd(), log = console.log } = {}) {
  const current = installedVersion(root);
  const { cmd, args } = packageManager(root);
  log(`glashjs update — current: ${current ?? 'not installed'}\n  $ ${cmd} ${args.join(' ')}\n`);
  await run(cmd, args, root);
  const next = installedVersion(root);
  if (next && next === current) log(`\n✓ already on the latest version (${next})`);
  else log(`\n✓ glashjs is now ${next ?? 'installed'}${current ? ` (was ${current})` : ''}`);
  return { from: current, to: next };
}
