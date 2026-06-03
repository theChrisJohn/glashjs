// Root middleware -> runs on every request. Here it tags responses with a
// header; it could also do auth, rate-limiting, logging, or rewrites.
export default function rootMiddleware(ctx) {
  ctx.startedAt = Date.now();
  ctx.res?.setHeader?.('X-Glash-Mw', 'root');
  // return nothing -> continue to the route
}
