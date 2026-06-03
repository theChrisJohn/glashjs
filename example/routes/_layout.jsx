// Root layout -> wraps every page. Nested `_layout.jsx` files compose inside it.
import { Link } from '../../src/components/link.mjs';

export default function RootLayout({ children }) {
  return (
    <div style="font:16px system-ui;max-width:44rem;margin:0 auto;padding:1rem;color:#e8eaed;background:#0b0d12;min-height:100vh">
      <header style="display:flex;gap:1rem;border-bottom:1px solid #222;padding-bottom:.75rem;margin-bottom:1rem">
        <Link href="/">glashjs</Link>
        <Link href="/counter">counter</Link>
        <Link href="/gallery">gallery</Link>
      </header>
      {children}
      <footer style="border-top:1px solid #222;margin-top:2rem;padding-top:.75rem;color:#7d818c">glashjs root layout</footer>
    </div>
  );
}
