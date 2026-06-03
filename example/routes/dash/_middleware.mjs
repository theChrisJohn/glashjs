// Nested middleware -> only runs for /dash/*. Gates the section behind "auth":
// redirects to the home page unless ?auth=1 is present. Returning a value
// short-circuits the request before the route renders.
import { redirect } from '../../../src/server/server.mjs';

export default function requireAuth(ctx) {
  if (ctx.query.auth !== '1') return redirect('/?login');
  ctx.user = { id: 'demo' };
}
