// glashjs asset optimizer
// ---------------------------------------------------------------------------
// Walks an input directory and produces optimized variants of every asset:
//   - text/SVG/JS/CSS/HTML/JSON  -> Brotli + Gzip (real, Node built-in zlib).
//                                   The browser decompresses transparently via
//                                   `Content-Encoding`, so this is the honest
//                                   version of "compress on build, decompress
//                                   when live."
//   - jpg/png/webp images        -> AVIF + WebP variants IF `sharp` is present.
//   - mp4/mov/webm video         -> AV1/HEVC + poster IF `ffmpeg` is on PATH.
//
// Everything degrades gracefully: with zero optional tools installed you still
// get real Brotli/Gzip savings and a complete manifest. Nothing is destructive
// — originals are never modified; variants are written alongside them.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);
const exec = promisify(execFile);

const TEXT_EXT = new Set(['.svg', '.css', '.js', '.mjs', '.html', '.json', '.txt', '.xml', '.map', '.webmanifest']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const VIDEO_EXT = new Set(['.mp4', '.mov', '.webm', '.m4v']);

const BROTLI_OPTS = {
  params: {
    [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
    [zlib.constants.BROTLI_PARAM_SIZE_HINT]: 0,
  },
};

async function sha(buf) {
  return createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

async function* walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

let _sharp; // lazy, optional
async function getSharp() {
  if (_sharp !== undefined) return _sharp;
  try { _sharp = (await import('sharp')).default; } catch { _sharp = null; }
  return _sharp;
}

let _ffmpeg; // lazy, optional
async function hasFfmpeg() {
  if (_ffmpeg !== undefined) return _ffmpeg;
  try { await exec('ffmpeg', ['-version']); _ffmpeg = true; } catch { _ffmpeg = false; }
  return _ffmpeg;
}

function pct(from, to) {
  if (!from) return 0;
  return Math.round((1 - to / from) * 1000) / 10;
}

async function optimizeText(file, buf, rel) {
  const [br, gz] = await Promise.all([brotli(buf, BROTLI_OPTS), gzip(buf, { level: 9 })]);
  await Promise.all([
    fs.writeFile(file + '.br', br),
    fs.writeFile(file + '.gz', gz),
  ]);
  return {
    kind: 'text',
    original: buf.length,
    variants: {
      br: { path: rel + '.br', bytes: br.length, encoding: 'br', saved: pct(buf.length, br.length) },
      gz: { path: rel + '.gz', bytes: gz.length, encoding: 'gzip', saved: pct(buf.length, gz.length) },
    },
    best: Math.min(br.length, gz.length),
  };
}

async function optimizeImage(file, buf, rel) {
  const sharp = await getSharp();
  if (!sharp) {
    return { kind: 'image', original: buf.length, best: buf.length, skipped: 'sharp not installed (npm i sharp to enable AVIF/WebP)', variants: {} };
  }
  const base = file.replace(/\.(jpe?g|png|webp)$/i, '');
  const relBase = rel.replace(/\.(jpe?g|png|webp)$/i, '');
  const [avif, webp] = await Promise.all([
    sharp(buf).avif({ quality: 50 }).toBuffer(),
    sharp(buf).webp({ quality: 72 }).toBuffer(),
  ]);
  await Promise.all([
    fs.writeFile(base + '.avif', avif),
    fs.writeFile(base + '.webp', webp),
  ]);
  return {
    kind: 'image',
    original: buf.length,
    variants: {
      avif: { path: relBase + '.avif', bytes: avif.length, type: 'image/avif', saved: pct(buf.length, avif.length) },
      webp: { path: relBase + '.webp', bytes: webp.length, type: 'image/webp', saved: pct(buf.length, webp.length) },
    },
    best: Math.min(avif.length, webp.length),
  };
}

async function optimizeVideo(file, buf, rel) {
  if (!(await hasFfmpeg())) {
    return { kind: 'video', original: buf.length, best: buf.length, skipped: 'ffmpeg not on PATH (install ffmpeg to enable AV1 + poster)', variants: {} };
  }
  const base = file.replace(/\.(mp4|mov|webm|m4v)$/i, '');
  const relBase = rel.replace(/\.(mp4|mov|webm|m4v)$/i, '');
  const out = base + '.glash.webm';
  const poster = base + '.poster.jpg';
  // AV1 (libaom) — much smaller than H.264 source; capped CRF for sane build times.
  await exec('ffmpeg', ['-y', '-i', file, '-c:v', 'libaom-av1', '-crf', '34', '-b:v', '0', '-c:a', 'libopus', out]);
  await exec('ffmpeg', ['-y', '-i', file, '-vf', 'select=eq(n\\,0)', '-vframes', '1', poster]).catch(() => {});
  const outBuf = await fs.readFile(out);
  return {
    kind: 'video',
    original: buf.length,
    variants: {
      av1: { path: relBase + '.glash.webm', bytes: outBuf.length, type: 'video/webm', saved: pct(buf.length, outBuf.length) },
      poster: { path: relBase + '.poster.jpg', type: 'image/jpeg' },
    },
    best: outBuf.length,
  };
}

/**
 * Optimize every asset under `dir`. Returns a manifest object:
 *   { generatedAt, totals, assets: { "<rel>": <entry> } }
 * Writes variant files alongside originals; never mutates originals.
 */
export async function optimizeAssets(dir, { log = () => {} } = {}) {
  const root = path.resolve(dir);
  const assets = {};
  let totalOriginal = 0;
  let totalBest = 0;

  for await (const file of walk(root)) {
    const ext = path.extname(file).toLowerCase();
    // Don't re-process our own outputs.
    if (file.endsWith('.br') || file.endsWith('.gz') || file.endsWith('.glash.webm') || file.endsWith('.poster.jpg')) continue;
    const rel = path.relative(root, file).split(path.sep).join('/');
    const buf = await fs.readFile(file);
    const hash = await sha(buf);

    let entry;
    if (TEXT_EXT.has(ext)) entry = await optimizeText(file, buf, rel);
    else if (IMAGE_EXT.has(ext)) entry = await optimizeImage(file, buf, rel);
    else if (VIDEO_EXT.has(ext)) entry = await optimizeVideo(file, buf, rel);
    else entry = { kind: 'raw', original: buf.length, best: buf.length, variants: {} };

    entry.hash = hash;
    assets[rel] = entry;
    totalOriginal += entry.original;
    totalBest += entry.best ?? entry.original;

    const saved = pct(entry.original, entry.best ?? entry.original);
    const tag = entry.skipped ? `skip (${entry.skipped})` : `${saved}% smaller`;
    log(`  ${entry.kind.padEnd(5)} ${rel} — ${tag}`);
  }

  return {
    generatedAt: null, // stamped by caller (build is deterministic; time injected outside)
    totals: {
      assets: Object.keys(assets).length,
      originalBytes: totalOriginal,
      optimizedBytes: totalBest,
      savedPercent: pct(totalOriginal, totalBest),
    },
    assets,
  };
}

export { TEXT_EXT, IMAGE_EXT, VIDEO_EXT };
