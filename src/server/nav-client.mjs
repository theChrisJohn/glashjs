// Source for /_glash/nav.js — the client-side navigation + dev HMR runtime.
//
// Navigation: intercepts <a data-glash-link> clicks, fetches the route as a
// partial (X-Glash-Nav: 1 -> JSON { title, html, props, bundle }), swaps
// #glash-root, updates <title> + history, and re-hydrates by importing the
// route's bundle. Falls back to a full navigation on any error.
//
// Dev HMR (window.__glashSoftRefresh): on a file change the dev server pushes
// a reload over SSE; instead of a full page reload, we re-render the current
// route in place — no white flash — and restore scroll, focus, and form input
// across the swap. (Note: component useState resets on re-render; preserving
// that is React-Fast-Refresh territory, which needs @prefresh.)
export const NAV_CLIENT = `// glashjs client navigation + dev HMR
async function navigate(href, push, keepScroll) {
  var data;
  try {
    var res = await fetch(href, { headers: { 'X-Glash-Nav': '1' }, credentials: 'same-origin' });
    if (!res.ok) throw 0;
    data = await res.json();
  } catch (e) { location.href = href; return; }
  var root = document.getElementById('glash-root');
  if (!root || !data || typeof data.html !== 'string') { location.href = href; return; }
  if (data.title) document.title = data.title;
  var pe = document.getElementById('glash-props');
  if (!pe) { pe = document.createElement('script'); pe.type = 'application/json'; pe.id = 'glash-props'; document.head.appendChild(pe); }
  pe.textContent = JSON.stringify(data.props || {});
  root.innerHTML = data.html;
  if (push) history.pushState({ glash: 1 }, '', href);
  if (!keepScroll) window.scrollTo(0, 0);
  if (data.bundle) { try { await import(data.bundle + '?v=' + Date.now()); } catch (e) {} }
}

document.addEventListener('click', function (e) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  var a = e.target.closest && e.target.closest('a[data-glash-link]');
  if (!a) return;
  var href = a.getAttribute('href');
  if (!href || a.target || /^([a-z]+:)?\\/\\//i.test(href) || href.startsWith('#') || href.startsWith('mailto:')) return;
  e.preventDefault();
  if (href !== location.pathname + location.search) navigate(href, true);
});
window.addEventListener('popstate', function () { navigate(location.pathname + location.search, false); });

window.__glashNavigate = navigate;

// Dev HMR: re-render the current route in place, preserving scroll/focus/inputs.
window.__glashSoftRefresh = async function () {
  var root = document.getElementById('glash-root');
  if (!root) { location.reload(); return; }
  var sx = window.scrollX, sy = window.scrollY;
  var active = document.activeElement;
  var focusName = active && active.getAttribute && active.getAttribute('name');
  var selStart = active && active.selectionStart;
  var selEnd = active && active.selectionEnd;
  var values = {};
  root.querySelectorAll('input[name],textarea[name],select[name]').forEach(function (el) {
    values[el.name] = (el.type === 'checkbox' || el.type === 'radio') ? el.checked : el.value;
  });
  await navigate(location.pathname + location.search, false, true);
  root.querySelectorAll('input[name],textarea[name],select[name]').forEach(function (el) {
    if (Object.prototype.hasOwnProperty.call(values, el.name)) {
      if (el.type === 'checkbox' || el.type === 'radio') el.checked = values[el.name];
      else el.value = values[el.name];
    }
  });
  window.scrollTo(sx, sy);
  if (focusName) {
    var el = root.querySelector('[name="' + focusName + '"]');
    if (el) { el.focus(); try { el.selectionStart = selStart; el.selectionEnd = selEnd; } catch (e) {} }
  }
};
`;
