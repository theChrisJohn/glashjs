// Page route -> "/". Default export is the SSR render function.
import { html } from '../../src/server/html.mjs';

export const title = 'glashjs — home';

export default function Home(ctx) {
  return {
    title,
    body: html`
      <main style="font:16px system-ui;max-width:40rem;margin:4rem auto;padding:0 1rem;color:#e8eaed;background:#0b0d12">
        <h1>glashjs</h1>
        <p>Server-rendered at <code>${new Date().toISOString()}</code> for path <code>${ctx.path}</code>.</p>
        <ul>
          <li><a href="/blog/hello-world">/blog/hello-world</a> (dynamic route)</li>
          <li><a href="/api/hello?name=Chris">/api/hello?name=Chris</a> (API route)</li>
        </ul>
      </main>`,
  };
}
