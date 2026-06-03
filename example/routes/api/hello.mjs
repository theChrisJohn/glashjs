// API route -> "/api/hello". Export one function per HTTP method.
import { json } from '../../../src/server/server.mjs';

export function GET(ctx) {
  return { ok: true, hello: ctx.query.name || 'world', path: ctx.path };
}

export function POST(ctx) {
  // ctx.body is the parsed JSON request body.
  return json({ ok: true, received: ctx.body }, { status: 201 });
}
