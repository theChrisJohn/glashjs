// glashjs <Link> — client-side navigation (SPA feel) without a full reload.
// Renders a normal <a> tagged for the nav runtime (/_glash/nav.js), so it still
// works with JS disabled (progressive enhancement) and is crawlable.
//
//   import { Link } from 'glashjs/link';
//   <Link href="/about">About</Link>
import { h } from 'preact';

export function Link({ href, children, prefetch, class: className, ...rest }) {
  return h('a', { href, 'data-glash-link': '', 'data-prefetch': prefetch ? '' : undefined, class: className, ...rest }, children);
}

export default Link;
