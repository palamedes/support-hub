// The Support widget. A tool adds it with one script tag:
//
//   <script async src="https://jasonellisbuilds.com/widget.js" data-tool="my-tool"></script>
//
// It adds a quiet "Support" button and a panel listing the ways to support.
// Styles live in a Shadow DOM so the widget and the host page can't break
// each other. It sets no cookies, tracks nothing, and makes no requests
// except for a QR image from the hub when someone asks to see one.
// Everything is wrapped so a failure here can never break the host tool.

import css from './widget.css';
import {
  createStore, shouldShowThanks, markThanksShown, markNever, markSupported, resetThanks,
} from './moments.js';

/* global __SUPPORT_CONFIG__ */
const CONFIG = __SUPPORT_CONFIG__;

// The little QR glyph on the "QR code" buttons.
const QR_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 ' +
  '2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm8-2h3v3h-3v-3zm5 0h3v3h-3v-3zm-5 5h3v3h-3v-3zm5 0h3v3h-3v-3zm-2-2h2v2h-2v-2z"/></svg>';

(function () {
  const existing = window.supportHub;
  if (existing && existing.loaded) return; // the script was included twice

  const script = document.currentScript ||
    document.querySelector('script[src*="widget.js"][data-tool]') ||
    document.querySelector('script[src*="widget.js"]');
  if (!script) return;

  const attr = (name) => (script.getAttribute('data-' + name) || '').trim();
  const base = new URL('.', script.src).href;
  const toolId = attr('tool').toLowerCase();
  const tool = CONFIG.tools[toolId] || null;
  const position = attr('position') || 'bottom-right';
  const mountSelector = attr('mount');
  const theme = attr('theme');
  const store = createStore(() => window.localStorage);

  let layer; // shadow root for the panel and the note
  let panel, backdrop, toast, live, qrBackdrop, qrDialog, qrImg, qrTitle;
  let qrFrom = null; // the QR button that opened the QR pop-up
  let isOpen = false;
  let lastFocus = null;
  let fadeTimer = 0;
  let fadeLeft = 0;
  let fadeStarted = 0;

  // ── helpers ───────────────────────────────────────────────────────────
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  const listText = (items) => items.length < 2 ? items.join('')
    : items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];

  function tagStripe(url) {
    if (!/^[a-z0-9-]+$/.test(toolId)) return url;
    try {
      const u = new URL(url);
      u.searchParams.set('client_reference_id', toolId);
      return u.toString();
    } catch (e) {
      return url;
    }
  }

  const badge = (m) => m.placeholder ? ' <span class="ph">placeholder</span>' : '';
  const link = (href, text, cls, extra = '') =>
    `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener" data-support${extra}>${text}</a>`;

  function amounts(rows, suffix) {
    return rows.map((r) => link(tagStripe(r.url), '$' + esc(r.amount) + suffix, 'btn pay')).join('');
  }

  function renderMethod(m) {
    if (m.type === 'stripe') {
      const s = m.stripe;
      let html = `<div class="method wide"><div class="m-head">${m.icon}${esc(m.label)}${badge(m)}</div>`;
      if (s.one_time.length || s.choose_your_own_url) {
        html += `<div class="row"><span class="row-label">One-time</span>${amounts(s.one_time, '')}` +
          (s.choose_your_own_url
            ? link(tagStripe(s.choose_your_own_url), 'Other', 'btn pay', ' aria-label="Other amount"')
            : '') + '</div>';
      }
      if (s.monthly.length) {
        html += `<div class="row"><span class="row-label">Monthly</span>${amounts(s.monthly, '/mo')}</div>`;
      }
      return html + '</div>';
    }
    // A QR code opens big in a pop-up, and its image loads only then.
    const qrButton = m.qr
      ? `<button type="button" class="btn qr-btn" aria-haspopup="dialog" data-qr="${esc(m.qr)}" ` +
        `data-qr-title="${esc(m.label)}" ` +
        `aria-label="QR code for ${esc(m.label)}">${QR_ICON}QR code</button>`
      : '';
    if (m.copy) {
      return `<div class="method wide"><div class="m-head">${m.icon}${esc(m.label)}${badge(m)}</div>` +
        `<code class="addr">${esc(m.display)}</code><div class="row">` +
        `<button type="button" class="btn" data-copy="${esc(m.copy)}">Copy address</button>` +
        link(m.href, 'Open in wallet', 'btn') + qrButton + '</div></div>';
    }
    const text = m.icon + esc(m.label) + badge(m); // the handle shows on the page the link opens
    if (m.qr) {
      return `<div class="method wide"><div class="row tight">${link(m.href, text, 'btn grow')}${qrButton}</div></div>`;
    }
    return `<div class="method">${link(m.href, text, 'btn block')}</div>`;
  }

  function triggerHtml() {
    const label = esc(attr('label') || 'Support');
    return `<button type="button" class="trigger" aria-haspopup="dialog">` +
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" ' +
      'd="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.4h2c.7-1.2 2.2-2.4 4.3-2.4 ' +
      '3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>' + `<span>${label}</span></button>`;
  }

  function makeHost(parent) {
    const host = document.createElement('div');
    host.setAttribute('data-support-hub', '');
    if (theme === 'light' || theme === 'dark') host.setAttribute('data-theme', theme);
    parent.appendChild(host);
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${css}</style>`;
    return root;
  }

  // ── build ─────────────────────────────────────────────────────────────
  function build() {
    const primary = CONFIG.methods.filter((m) => m.primary);
    const rest = CONFIG.methods.filter((m) => !m.primary);
    const name = tool ? tool.name : CONFIG.brand.name;
    const pitch = (tool && tool.thanks_text) || CONFIG.brand.pitch;
    const corner = /^(top|bottom)-(left|right)$/.test(position) ? position : 'bottom-right';
    const useCorner = !mountSelector && position !== 'none';

    layer = makeHost(document.body);
    const wrap = document.createElement('div');
    wrap.className = 'wrap ' + corner + (useCorner ? ' has-trigger' : '');
    wrap.innerHTML =
      (useCorner ? triggerHtml() : '') +
      '<div class="sr" role="status" aria-live="polite"></div>' +
      `<div class="toast" role="region" aria-label="A note from ${esc(CONFIG.brand.name)}" hidden>` +
      '<p class="t-msg"></p><div class="row">' +
      '<button type="button" class="btn pay t-tip">Leave a tip</button>' +
      '<button type="button" class="t-never">Don\'t show again</button></div>' +
      '<button type="button" class="x t-close" aria-label="Dismiss">&times;</button></div>' +
      '<div class="backdrop" hidden>' +
      '<div class="panel" role="dialog" aria-modal="true" aria-labelledby="sh-title" tabindex="-1">' +
      '<button type="button" class="x close" aria-label="Close">&times;</button>' +
      `<h2 id="sh-title">Support ${esc(name)}</h2>` +
      `<p class="by">by ${esc(CONFIG.brand.name)}</p>` +
      `<p class="pitch">${esc(pitch)}</p>` +
      (CONFIG.brand.pays_for.length ? `<p class="pays">Tips pay for ${esc(listText(CONFIG.brand.pays_for))}.</p>` : '') +
      (primary.length ? `<div class="methods">${primary.map(renderMethod).join('')}</div>` : '') +
      (rest.length
        ? (primary.length ? '<h3 class="other">Other ways to support</h3>' : '') +
          `<div class="methods">${rest.map(renderMethod).join('')}</div>`
        : '') +
      `<p class="fine">${esc(CONFIG.brand.tax_note)} ` +
      `<a href="${esc(base)}support/?from=${encodeURIComponent(toolId)}" target="_blank" rel="noopener">See every way to support</a></p>` +
      '</div></div>' +
      '<div class="qr-backdrop" hidden>' +
      '<div class="qr-dialog" role="dialog" aria-modal="true" aria-labelledby="sh-qr-title" tabindex="-1">' +
      '<button type="button" class="x qr-close" aria-label="Close the QR code">&times;</button>' +
      '<h3 id="sh-qr-title"></h3><img class="qr-big" width="240" height="240" alt="">' +
      '<p class="qr-hint">Point your phone\'s camera at the code.</p></div></div>';
    layer.appendChild(wrap);

    const $ = (sel) => layer.querySelector(sel);
    panel = $('.panel');
    backdrop = $('.backdrop');
    toast = $('.toast');
    live = $('.sr');
    qrBackdrop = $('.qr-backdrop');
    qrDialog = $('.qr-dialog');
    qrImg = $('.qr-big');
    qrTitle = $('#sh-qr-title');

    layer.addEventListener('click', onClick);
    toast.addEventListener('mouseenter', pauseFade);
    toast.addEventListener('mouseleave', resumeFade);
    toast.addEventListener('focusin', pauseFade);
    toast.addEventListener('focusout', resumeFade);
    toast.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideToast();
    });

    if (mountSelector) {
      const target = document.querySelector(mountSelector);
      if (target) {
        const root = makeHost(target);
        const inline = document.createElement('div');
        inline.className = 'wrap inline';
        inline.innerHTML = triggerHtml();
        root.appendChild(inline);
        root.addEventListener('click', onClick);
      }
    }
  }

  // ── panel ─────────────────────────────────────────────────────────────
  function deepActive() {
    let el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
    return el;
  }

  function focusables(box) {
    return Array.prototype.filter.call(
      box.querySelectorAll('a[href], button:not([disabled])'),
      (el) => !el.closest('[hidden]'),
    );
  }

  function open() {
    if (isOpen) return;
    lastFocus = deepActive();
    hideToast(true);
    backdrop.hidden = false;
    isOpen = true;
    panel.focus();
    document.addEventListener('keydown', onKey, true);
  }

  function close() {
    if (!isOpen) return;
    closeQr(false);
    backdrop.hidden = true;
    isOpen = false;
    document.removeEventListener('keydown', onKey, true);
    if (lastFocus && lastFocus.isConnected && typeof lastFocus.focus === 'function') lastFocus.focus();
    lastFocus = null;
  }

  function onKey(e) {
    if (!isOpen) return;
    const box = qrBackdrop.hidden ? panel : qrDialog; // the QR pop-up sits on top of the panel
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (box === qrDialog) closeQr(true);
      else close();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = focusables(box);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = layer.activeElement;
    if (!active || !box.contains(active)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    } else if (items.length === 1) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && (active === first || active === box)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function openQr(btn) {
    const title = btn.getAttribute('data-qr-title');
    qrTitle.textContent = title;
    qrImg.alt = 'QR code for ' + title;
    qrImg.src = base + btn.getAttribute('data-qr');
    qrFrom = btn;
    qrBackdrop.hidden = false;
    qrDialog.focus();
  }

  function closeQr(returnFocus) {
    if (!qrBackdrop || qrBackdrop.hidden) return;
    qrBackdrop.hidden = true;
    if (returnFocus && qrFrom) qrFrom.focus();
    qrFrom = null;
  }

  function copyText(btn) {
    const text = btn.getAttribute('data-copy');
    const done = (ok) => {
      btn.textContent = ok ? 'Copied' : 'Select it and copy';
      announce(ok ? 'Address copied.' : 'Copying failed. Select the address and copy it.');
      setTimeout(() => { btn.textContent = 'Copy address'; }, 2000);
    };
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      btn.parentNode.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (e) {
        ok = false;
      }
      ta.remove();
      btn.focus();
      done(ok);
    };
    try {
      navigator.clipboard.writeText(text).then(() => done(true), fallback);
    } catch (e) {
      fallback();
    }
  }

  function announce(text) {
    live.textContent = '';
    setTimeout(() => { live.textContent = text; }, 50);
  }

  function onClick(e) {
    const t = e.target;
    if (t === qrBackdrop) return closeQr(true);
    if (t === backdrop) return close();
    const el = t.closest ? t.closest('button, a') : null;
    if (!el) return;
    const has = (c) => el.classList.contains(c);
    if (has('trigger')) open();
    else if (has('close')) close();
    else if (has('qr-btn')) openQr(el);
    else if (has('qr-close')) closeQr(true);
    else if (el.hasAttribute('data-copy')) copyText(el);
    else if (el.hasAttribute('data-support')) {
      markSupported(store);
      hideToast(true);
    } else if (has('t-tip')) open();
    else if (has('t-never')) {
      markNever(store);
      hideToast(true);
    } else if (has('t-close')) hideToast(true);
  }

  // ── thank-you note ────────────────────────────────────────────────────
  function thanks(opts) {
    if (!CONFIG.thanks.enabled || isOpen) return false;
    if (!shouldShowThanks(store, toolId, { intervalDays: CONFIG.thanks.interval_days })) return false;
    markThanksShown(store, toolId);
    const message = (opts && opts.message) || (tool && tool.thanks_text) || CONFIG.thanks.message;
    toast.querySelector('.t-msg').textContent = message;
    toast.hidden = false;
    toast.classList.remove('out');
    announce(message);
    fadeLeft = CONFIG.thanks.fade_seconds * 1000;
    resumeFade();
    return true;
  }

  function pauseFade() {
    if (!fadeTimer) return;
    clearTimeout(fadeTimer);
    fadeTimer = 0;
    fadeLeft -= Date.now() - fadeStarted;
  }

  function resumeFade() {
    if (toast.hidden || fadeTimer) return;
    if (toast.contains(layer.activeElement)) return;
    fadeStarted = Date.now();
    fadeTimer = setTimeout(() => hideToast(false), Math.max(fadeLeft, 1500));
  }

  function hideToast(now) {
    clearTimeout(fadeTimer);
    fadeTimer = 0;
    if (!toast || toast.hidden) return;
    if (now) {
      toast.hidden = true;
      return;
    }
    toast.classList.add('out');
    setTimeout(() => {
      if (toast.classList.contains('out')) toast.hidden = true;
    }, 400);
  }

  // ── public API ────────────────────────────────────────────────────────
  function api(command, arg) {
    try {
      if (command === 'open') return open(), true;
      if (command === 'close') return close(), true;
      if (command === 'thanks') return thanks(arg);
      if (command === 'reset') return resetThanks(store, Object.keys(CONFIG.tools)), true;
    } catch (e) {
      // Never let the widget break the host page.
    }
    return false;
  }

  function start() {
    try {
      build();
    } catch (e) {
      return; // Leave the stub in place; calls stay harmless no-ops.
    }
    const queued = (existing && existing.q) || [];
    api.loaded = true;
    api.version = 1;
    window.supportHub = api;
    queued.forEach((args) => api.apply(null, args));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
