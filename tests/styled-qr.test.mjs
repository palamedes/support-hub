import QRCode from 'qrcode';
import { describe, it, expect } from 'vitest';
import { styledQrSvg } from '../scripts/styled-qr.mjs';
import { PAYMENT_ICONS } from '../src/pages/payment-icons.mjs';

describe('styled QR codes', () => {
  const link = 'https://cash.app/$example';

  it('draws the same grid as a plain QR code, with a quiet margin', () => {
    const n = QRCode.create(link, { errorCorrectionLevel: 'H' }).modules.size;
    expect(styledQrSvg(link)).toContain(`viewBox="0 0 ${n + 4} ${n + 4}"`);
  });

  it('puts the logo in the middle and clears the dots under it', () => {
    const withLogo = styledQrSvg(link, { logo: 'cashapp' });
    const without = styledQrSvg(link);
    expect(withLogo).toContain(PAYMENT_ICONS.cashapp.d);
    const dots = (svg) => (svg.match(/<circle/g) || []).length;
    expect(dots(withLogo)).toBeLessThan(dots(without));
  });

  it('names the logos it knows when given one it does not', () => {
    expect(() => styledQrSvg(link, { logo: 'nope' })).toThrow(/Use one of/);
  });
});
