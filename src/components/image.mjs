// glashjs <Image> — a zero-config image component that's better than next/image
// out of the box: it emits a <picture> that prefers the AVIF/WebP variants the
// glashjs asset optimizer already produced at build time, with no runtime image
// server, no signed URLs, and no config. Width/height are required-by-habit to
// prevent layout shift (CLS), and images lazy-load + async-decode by default.
//
//   import { Image } from 'glashjs/image';
//   <Image src="/hero.png" alt="Hero" width={1200} height={630} />
//
// After `glash build`, /hero.avif and /hero.webp exist next to /hero.png, so
// the browser downloads the smallest format it supports. Deterministic output
// (same on server + during hydration), so it never causes a hydration mismatch.
import { h } from 'preact';

const RASTER = /\.(png|jpe?g|webp|avif)$/i;

export function Image({ src, alt = '', width, height, sizes, loading = 'lazy', fetchpriority, class: className, style, ...rest }) {
  if (!src || !RASTER.test(src)) {
    // SVG/unknown: render a plain <img>, nothing to transcode.
    return h('img', { src, alt, width, height, loading, decoding: 'async', class: className, style, ...rest });
  }
  const base = src.replace(RASTER, '');
  return h(
    'picture',
    { class: className, style },
    h('source', { srcset: `${base}.avif`, type: 'image/avif', sizes }),
    h('source', { srcset: `${base}.webp`, type: 'image/webp', sizes }),
    h('img', {
      src,
      alt,
      width,
      height,
      sizes,
      loading,
      fetchpriority,
      decoding: 'async',
      ...rest,
    }),
  );
}

export default Image;
