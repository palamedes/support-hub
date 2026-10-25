// Makes a styled QR code: round dots, rounded corner squares and a brand
// logo in the middle, in the look the payment apps use for their own codes.
//
//   node scripts/styled-qr.mjs <link> <images/out.svg> [logo] [color]
//
//   node scripts/styled-qr.mjs 'https://cash.app/$jasonellis72' images/cashapp-qr.svg cashapp
//
// `logo` is a method type from src/pages/payment-icons.mjs (cashapp, venmo,
// paypal, ...). The code uses the highest error correction, so the logo in the
// middle doesn't stop it scanning. Scan the result with a phone before using
// it, then point a method's `qr_image` at it in config.yml.

import fs from 'node:fs';
import QRCode from 'qrcode';
import { PAYMENT_ICONS } from '../src/pages/payment-icons.mjs';

export function styledQrSvg(text, { logo = null, color = '#000000', margin = 2 } = {}) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'H' });
  const n = modules.size;
  const full = n + margin * 2;
  const isFinder = (r, c) => (r < 8 && c < 8) || (r < 8 && c >= n - 8) || (r >= n - 8 && c < 8);

  // Leave a clear square in the middle for the logo (about a quarter of the width).
  let hole = logo ? Math.round(n * 0.27) : 0;
  if (hole && hole % 2 !== n % 2) hole += 1;
  const lo = (n - hole) / 2;
  const inHole = (r, c) => hole && r >= lo - 1 && r < lo + hole + 1 && c >= lo - 1 && c < lo + hole + 1;

  const parts = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!modules.get(r, c) || isFinder(r, c) || inHole(r, c)) continue;
      parts.push(`<circle cx="${c + margin + 0.5}" cy="${r + margin + 0.5}" r="0.42"/>`);
    }
  }
  // The three corner squares, rounded.
  for (const [r, c] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    const x = c + margin;
    const y = r + margin;
    parts.push(
      `<path fill-rule="evenodd" d="M${x + 2} ${y}h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2z` +
      `M${x + 2.2} ${y + 1}h2.6a1.2 1.2 0 0 1 1.2 1.2v2.6a1.2 1.2 0 0 1-1.2 1.2h-2.6a1.2 1.2 0 0 1-1.2-1.2v-2.6a1.2 1.2 0 0 1 1.2-1.2z"/>`,
      `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="0.9"/>`,
    );
  }
  if (logo) {
    const icon = PAYMENT_ICONS[logo];
    if (!icon) throw new Error(`No logo called "${logo}". Use one of: ${Object.keys(PAYMENT_ICONS).join(', ')}`);
    const scale = hole / 24;
    parts.push(`<path transform="translate(${lo + margin} ${lo + margin}) scale(${scale})" d="${icon.d}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${full} ${full}" shape-rendering="geometricPrecision">` +
    `<rect width="${full}" height="${full}" fill="#ffffff"/><g fill="${color}">${parts.join('')}</g></svg>\n`;
}

if (process.argv[1] && process.argv[1].endsWith('styled-qr.mjs')) {
  const [text, out, logo, color] = process.argv.slice(2);
  if (!text || !out) {
    console.error('Usage: node scripts/styled-qr.mjs <link> <images/out.svg> [logo] [color]');
    process.exit(1);
  }
  fs.writeFileSync(out, styledQrSvg(text, { logo: logo || null, color: color || '#000000' }));
  console.log(`Wrote ${out}. Scan it with your phone before using it.`);
}
