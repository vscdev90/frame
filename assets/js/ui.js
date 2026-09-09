/** Small DOM and formatting helpers. No framework, no build step. */

/** Escape anything that came from the user before it reaches innerHTML. */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Build an element from an HTML string. */
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function frag(html) {
  const t = document.createElement('template');
  t.innerHTML = html;
  return t.content;
}

export function qs(sel, root = document) { return root.querySelector(sel); }
export function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

/** Delegated click handling keeps the views declarative. */
export function onClick(root, selector, handler) {
  root.addEventListener('click', (e) => {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) handler(e, target);
  });
}

export function money(v) {
  if (v == null || Number.isNaN(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1000000) return `€ ${(v / 1000000).toFixed(2)}M`;
  if (abs >= 1000) return `€ ${Math.round(v / 1000)}k`;
  return `€ ${Math.round(v)}`;
}

export function moneyExact(v) {
  return `€ ${Math.round(v).toLocaleString('nl-NL')}`;
}

export function range(low, high) { return `${money(low)} – ${money(high)}`; }

export function area(v) { return `${Math.round(v * 10) / 10} m²`; }

export function pct(v) { return `${Math.round(v * 100)}%`; }

export function toneClass(score) {
  if (score >= 65) return 'good';
  if (score >= 45) return 'warn';
  return 'bad';
}

/** A 0–100 meter with its tone derived from the score. */
export function meter(score) {
  return `<div class="meter ${toneClass(score) === 'good' ? '' : toneClass(score)}"><i style="width:${Math.max(2, Math.min(100, score))}%"></i></div>`;
}

/**
 * A meter for a value where MORE is worse (complexity, for example).
 * The bar length matches the number shown, but the colour flips, so the
 * reader never has to reconcile a long green bar with a bad score.
 */
export function meterInverse(value) {
  const v = Math.max(2, Math.min(100, value));
  const tone = value <= 35 ? '' : value <= 60 ? 'warn' : 'bad';
  return `<div class="meter ${tone}"><i style="width:${v}%"></i></div>`;
}

export function initials(name) {
  return String(name || 'FR').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

export function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return ''; }
}

/** Minimal line icons, sized to the text. */
export const icons = {
  bed: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 17v-6h20v6M2 17v3M22 17v3M2 11V7h9v4M11 11h11"/></svg>',
  bath: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 12h18v3a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-3ZM6 12V6a2 2 0 0 1 4 0M6 19l-1 2M18 19l1 2"/></svg>',
  desk: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 8h18M4 8v12M20 8v12M4 8V5h16v3M8 12h5"/></svg>',
  kitchen: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 4h16v16H4zM4 10h16M8 4v6M12 14h4"/></svg>',
  sofa: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 13V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5M2 13h20v5H2zM6 18v2M18 18v2"/></svg>',
  utility: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="13" r="4"/><path d="M8 6h3"/></svg>',
  box: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 7l9-4 9 4v10l-9 4-9-4V7ZM3 7l9 4 9-4M12 11v10"/></svg>',
  grid: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
  cube: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2 3 7v10l9 5 9-5V7l-9-5ZM3 7l9 5 9-5M12 12v10"/></svg>',
  plan: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18"/><path d="M3 12h9M12 3v18"/></svg>',
  facade: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 21V9l9-6 9 6v12M9 21v-6h6v6"/></svg>',
  layers: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m12 3 9 5-9 5-9-5 9-5ZM3 13l9 5 9-5"/></svg>',
  euro: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 5a7 7 0 1 0 0 14M3 10h9M3 14h9"/></svg>',
  check: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m4 12 5 5L20 6"/></svg>',
  arrowRight: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 12h15M13 6l6 6-6 6"/></svg>',
  arrowLeft: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M20 12H5M11 6l-6 6 6 6"/></svg>',
  info: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  doc: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2h8l4 4v16H6zM14 2v4h4M9 12h6M9 16h6"/></svg>'
};

/** Announce a transient message to screen readers and the eye alike. */
export function toast(message) {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    host.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:80;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none';
    document.body.appendChild(host);
  }
  const node = el(`<div style="background:#14110f;color:#fff;padding:10px 18px;border-radius:999px;font-size:.8125rem;box-shadow:0 8px 30px rgba(0,0,0,.18)">${esc(message)}</div>`);
  host.appendChild(node);
  setTimeout(() => node.remove(), 2600);
}
