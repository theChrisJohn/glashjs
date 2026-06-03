// Dynamic page route -> "/blog/:slug". The slug is in ctx.params.
import { html } from '../../../src/server/html.mjs';

export default function BlogPost(ctx) {
  const { slug } = ctx.params;
  return {
    title: `glashjs — ${slug}`,
    body: html`
      <main style="font:16px system-ui;max-width:40rem;margin:4rem auto;padding:0 1rem;color:#e8eaed;background:#0b0d12">
        <a href="/">&larr; home</a>
        <h1>${slug.replace(/-/g, ' ')}</h1>
        <p>This page was server-rendered for slug <code>${slug}</code>.</p>
      </main>`,
  };
}
