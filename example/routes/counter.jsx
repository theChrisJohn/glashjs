// JSX page route -> "/counter". Server-rendered AND hydrated, so the button
// is interactive in the browser (real useState). This is the Next-style model.
import { useState } from 'preact/hooks';

export const title = 'glashjs — counter';

// Runs on the server; its return value is the props for SSR + hydration.
export function getServerData(ctx) {
  return { start: Number(ctx.query.start || 0) };
}

export default function Counter({ start = 0 }) {
  const [n, setN] = useState(start);
  return (
    <main style="font:16px system-ui;max-width:40rem;margin:4rem auto;padding:0 1rem;color:#e8eaed;background:#0b0d12">
      <a href="/">&larr; home</a>
      <h1>Counter</h1>
      <p>Server-rendered with start={start}; interactive after hydration.</p>
      <button onClick={() => setN(n + 1)} style="font:16px system-ui;padding:.5rem 1rem;border-radius:8px">
        count is {n}
      </button>
    </main>
  );
}
