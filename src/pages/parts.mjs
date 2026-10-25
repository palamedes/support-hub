// Small pieces shared by the hub's pages.

import { tagStripeUrl } from '../../scripts/lib/config.mjs';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

/** "a, b and c" */
export const listText = (items) => items.length < 2 ? items.join('')
  : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

const badge = (m) => (m.placeholder ? ' <span class="ph">placeholder</span>' : '');
const out = (href, text, cls, extra = '') =>
  `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener"${extra}>${text}</a>`;

function stripeBlock(m, toolId) {
  const s = m.stripe;
  const amount = (r, suffix) =>
    out(tagStripeUrl(r.url, toolId), `$${esc(r.amount)}${suffix}`, 'btn pay', ' data-stripe');
  let html = `<div class="method wide"><h3 class="m-head">${esc(m.label)}${badge(m)}</h3>`;
  if (s.one_time.length || s.choose_your_own_url) {
    html += '<div class="row"><span class="row-label">One-time</span>' +
      s.one_time.map((r) => amount(r, '')).join('') +
      (s.choose_your_own_url
        ? out(tagStripeUrl(s.choose_your_own_url, toolId), 'Other amount', 'btn', ' data-stripe')
        : '') + '</div>';
  }
  if (s.monthly.length) {
    html += '<div class="row"><span class="row-label">Monthly</span>' +
      s.monthly.map((r) => amount(r, '/mo')).join('') + '</div>';
  }
  return html + '</div>';
}

/**
 * The list of support options.
 * @param {object[]} methods
 * @param {{toolId?: string, qr?: Record<string,string>}} opts - qr maps a method
 *   type to its inline SVG (the support page shows QR codes; the home page doesn't).
 */
export function methodsHtml(methods, { toolId = null, qr = null } = {}) {
  return methods.map((m) => {
    if (m.type === 'stripe') return stripeBlock(m, toolId);
    const qrHtml = qr && qr[m.type]
      ? `<figure class="qr">${qr[m.type]}<figcaption>Scan with your phone</figcaption></figure>`
      : '';
    // A QR code sits beside its method, so the grid stays even.
    const wrap = (main) => (qrHtml
      ? `<div class="method wide with-qr"><div class="m-main">${main}</div>${qrHtml}</div>`
      : `<div class="method${m.copy ? ' wide' : ''}">${main}</div>`);
    if (m.copy) {
      return wrap(`<h3 class="m-head">${esc(m.label)}${badge(m)}</h3>` +
        `<code class="addr">${esc(m.display)}</code><div class="row">` +
        `<button type="button" class="btn" data-copy="${esc(m.copy)}">Copy address</button>` +
        out(m.href, 'Open in wallet', 'btn') + '</div>');
    }
    const text = `${esc(m.label)}${m.display ? ` <span class="handle">${esc(m.display)}</span>` : ''}${badge(m)}`;
    return wrap(out(m.href, text, 'btn block'));
  }).join('\n');
}

/** Every way to support: the primary methods first, then the others. */
export function supportOptions(cfg, { toolId = null, qr = null, primaryOnly = false } = {}) {
  const primary = cfg.methods.filter((m) => m.primary);
  const rest = primaryOnly ? [] : cfg.methods.filter((m) => !m.primary);
  let html = primary.length ? `<div class="methods">${methodsHtml(primary, { toolId, qr })}</div>` : '';
  if (rest.length) {
    html += (primary.length ? '<h3 class="other-ways">Other ways to support</h3>' : '') +
      `<div class="methods">${methodsHtml(rest, { toolId, qr })}</div>`;
  }
  return html;
}

export function paysFor(cfg) {
  return cfg.brand.pays_for.length
    ? `<p class="pays">Tips pay for ${esc(listText(cfg.brand.pays_for))}.</p>`
    : '';
}

export function screenshot(tool, cls = 'shot') {
  if (!tool.screenshot) return '';
  return `<div class="${cls}"><img src="/screenshots/${esc(tool.screenshot)}" ` +
    `alt="Screenshot of ${esc(tool.name)}" loading="lazy" decoding="async"></div>`;
}

/** A section heading with the short blue rule under it. */
export const heading = (text, id) => `<h2 class="section-heading"${id ? ` id="${id}"` : ''}>${esc(text)}</h2>`;
