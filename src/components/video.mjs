// glashjs <Video> — zero-config video that prefers the AV1/WebM the glashjs
// optimizer produced at build time, with the original as fallback and an
// auto-derived poster frame. Deterministic output (SSR + hydration match).
//
//   import { Video } from 'glashjs/video';
//   <Video src="/clip.mp4" width={1280} height={720} />
//
// After `glash build`, /clip.glash.webm (AV1) and /clip.poster.jpg exist, so
// browsers stream the far-smaller AV1 and fall back to the mp4 otherwise.
import { h } from 'preact';

const VID = /\.(mp4|mov|webm|m4v)$/i;

export function Video({ src, poster, width, height, controls = true, autoplay, loop, muted, playsinline, preload = 'metadata', class: className, style, ...rest }) {
  if (!src || !VID.test(src)) {
    return h('video', { src, poster, width, height, controls, preload, class: className, style, ...rest });
  }
  const base = src.replace(VID, '');
  return h(
    'video',
    { width, height, controls, autoplay, loop, muted, playsinline, preload, poster: poster || `${base}.poster.jpg`, class: className, style, ...rest },
    h('source', { src: `${base}.glash.webm`, type: 'video/webm' }),
    h('source', { src, type: 'video/mp4' }),
  );
}

export default Video;
