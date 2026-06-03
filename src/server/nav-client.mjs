// Source for /_glash/nav.js — the client-side navigation runtime.
// Intercepts clicks on <a data-glash-link>, fetches the route as a partial
// (X-Glash-Nav: 1 -> JSON { title, html, props, bundle }), swaps #glash-root,
// updates the props block + <title>, pushes history, and re-hydrates by
// importing the new route's bundle. Falls back to a full navigation on any error.
export const NAV_CLIENT = `// glashjs client navigation
async function navigate(href, push) {
  let data;
  try {
    const res = await fetch(href, { headers: { 'X-Glash-Nav': '1' }, credentials: 'same-origin' });
    if (!res.ok) throw 0;
    data = await res.json();
  } catch { location.href = href; return; }
  const root = document.getElementById('glash-root');
  if (!root || !data || typeof data.html !== 'string') { location.href = href; return; }
  if (data.title) document.title = data.title;
  let pe = document.getElementById('glash-props');
  if (!pe) { pe = document.createElement('script'); pe.type = 'application/json'; pe.id = 'glash-props'; document.head.appendChild(pe); }
  pe.textContent = JSON.stringify(data.props || {});
  root.innerHTML = data.html;
  if (push) history.pushState({ glash: 1 }, '', href);
  window.scrollTo(0, 0);
  if (data.bundle) { try { await import(data.bundle); } catch {} }
}
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest && e.target.closest('a[data-glash-link]');
  if (!a) return;
  const href = a.getAttribute('href');
  if (!href || a.target || /^([a-z]+:)?\\/\\//i.test(href) || href.startsWith('#') || href.startsWith('mailto:')) return;
  e.preventDefault();
  if (href !== location.pathname + location.search) navigate(href, true);
});
window.addEventListener('popstate', () => navigate(location.pathname + location.search, false));
`;
