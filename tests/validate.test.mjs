import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { loadConfigFile, validateConfig, tagStripeUrl } from '../scripts/lib/config.mjs';
import { ROOT } from '../scripts/build.mjs';

// The P2WPKH test vector from BIP 173, not anyone's wallet.
const TEST_BTC = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

const good = () => ({
  site: { url: 'https://tools.example.com/' },
  brand: { name: 'Test Maker', pitch: 'Free tools.', pays_for: ['hosting'], tax_note: 'Not deductible.' },
  thanks: { enabled: true, interval_days: 30, fade_seconds: 12, message: 'Thanks!' },
  tools: [{ id: 'my-tool', name: 'My Tool', description: 'Does things.', url: 'https://example.com/my-tool' }],
  methods: [
    {
      type: 'stripe', primary: true,
      one_time: [{ amount: 5, url: 'https://example.com/stripe/5' }],
      choose_your_own_url: 'https://example.com/stripe/any',
    },
    { type: 'kofi', primary: true, url: 'https://example.com/kofi' },
    { type: 'venmo', handle: '@example-user' },
    { type: 'bitcoin', address: TEST_BTC },
    { type: 'lightning', address: 'tips@example.com' },
  ],
});

const check = (cfg, opts) => validateConfig(cfg, opts);
const joined = (list) => list.join('\n');

describe('config validation', () => {
  it('accepts a complete config, even for production', () => {
    const { errors, warnings, config } = check(good(), { production: true });
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(config.site.url).toBe('https://tools.example.com'); // trailing slash removed
  });

  it('rejects a tool with no url, and says what the url is for', () => {
    const cfg = good();
    delete cfg.tools[0].url;
    const { errors, config } = check(cfg);
    expect(config).toBeNull();
    expect(joined(errors)).toMatch(/tools → "my-tool" has no url/);
  });

  it('rejects a tool url that is not a web address', () => {
    const cfg = good();
    cfg.tools[0].url = 'my-tool.example';
    expect(joined(check(cfg).errors)).toMatch(/isn't a web address/);
  });

  it('rejects tool ids that would not work in a script tag or in Stripe', () => {
    const cfg = good();
    cfg.tools[0].id = 'My Tool';
    expect(joined(check(cfg).errors)).toMatch(/lowercase letters, numbers and dashes/);
  });

  it('lists tools by default and keeps listed: false ones off the grid', () => {
    const cfg = good();
    cfg.tools.push({ id: 'blog', name: 'My Blog', url: 'https://example.com/blog', listed: false });
    const { errors, warnings, config } = check(cfg);
    expect(errors).toEqual([]);
    expect(config.tools.map((t) => t.listed)).toEqual([true, false]);
    expect(joined(warnings)).not.toMatch(/"blog" has no description/);
  });

  it('rejects two tools with the same id', () => {
    const cfg = good();
    cfg.tools.push({ ...cfg.tools[0] });
    expect(joined(check(cfg).errors)).toMatch(/two tools share this id/);
  });

  it('treats a placeholder as a warning while working', () => {
    const cfg = good();
    cfg.methods[1].url = 'https://ko-fi.com/<<YOUR-KOFI-NAME>>';
    const { errors, warnings, config } = check(cfg);
    expect(errors).toEqual([]);
    expect(joined(warnings)).toMatch(/methods → kofi → url still has the placeholder <<YOUR-KOFI-NAME>>/);
    expect(config.methods.find((m) => m.type === 'kofi').placeholder).toBe(true);
  });

  it('refuses an enabled method with a placeholder in a production build', () => {
    const cfg = good();
    cfg.methods[0].one_time[0].url = '<<STRIPE-LINK-ONE-TIME-5>>';
    const { errors } = check(cfg, { production: true });
    expect(joined(errors)).toMatch(/stripe → one_time → 5 → url still has the placeholder/);
    expect(joined(errors)).toMatch(/or set enabled: false/);
  });

  it('ignores placeholders in a method that is switched off', () => {
    const cfg = good();
    cfg.methods.push({ type: 'paypal', enabled: false, url: 'https://paypal.me/<<NAME>>' });
    const { errors, config } = check(cfg, { production: true });
    expect(errors).toEqual([]);
    expect(config.methods.some((m) => m.type === 'paypal')).toBe(false);
  });

  it('refuses a placeholder in a tool when publishing', () => {
    const cfg = good();
    cfg.tools[0].url = '<<TOOL-URL>>';
    expect(joined(check(cfg, { production: true }).errors)).toMatch(/my-tool" → url still has the placeholder/);
  });

  it('names unknown method types and lists the known ones', () => {
    const cfg = good();
    cfg.methods.push({ type: 'dogecoin', address: 'x' });
    expect(joined(check(cfg).errors)).toMatch(/"dogecoin" isn't a type this hub knows/);
  });

  it('asks for the field a method needs', () => {
    const cfg = good();
    cfg.methods.push({ type: 'cashapp' });
    expect(joined(check(cfg).errors)).toMatch(/cashapp needs handle/);
  });

  it('catches addresses that are obviously wrong', () => {
    const cfg = good();
    cfg.methods[3].address = 'not-a-bitcoin-address';
    cfg.methods[4].address = 'not-an-address';
    const msg = joined(check(cfg).errors);
    expect(msg).toMatch(/doesn't look like a Bitcoin address/);
    expect(msg).toMatch(/doesn't look like a Lightning address/);
  });

  it('accepts Ethereum addresses and catches bad ones', () => {
    const cfg = good();
    cfg.methods.push({ type: 'ethereum', address: '0x' + 'a'.repeat(40) });
    const eth = check(cfg).config.methods.find((m) => m.type === 'ethereum');
    expect(eth.href).toBe('ethereum:0x' + 'a'.repeat(40));
    expect(eth.qr_path).toBe('qr/ethereum.svg');
    cfg.methods[cfg.methods.length - 1].address = '0x123';
    expect(joined(check(cfg).errors)).toMatch(/doesn't look like an Ethereum address/);
  });

  it('warns when too many methods are primary', () => {
    const cfg = good();
    cfg.methods.forEach((m) => { m.primary = true; });
    expect(joined(check(cfg).warnings)).toMatch(/5 methods are primary/);
  });

  it('checks the thank-you settings', () => {
    const cfg = good();
    cfg.thanks.interval_days = -1;
    cfg.thanks.fade_seconds = 500;
    const msg = joined(check(cfg).errors);
    expect(msg).toMatch(/interval_days/);
    expect(msg).toMatch(/fade_seconds/);
  });

  it('reports a screenshot that is missing from the screenshots folder', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shots-'));
    const cfg = good();
    cfg.tools[0].screenshot = 'nope.webp';
    expect(joined(check(cfg, { screenshotsDir: dir }).errors)).toMatch(/"nope.webp" isn't in the screenshots folder/);
  });

  it('builds Venmo and Bitcoin links from a handle or an address', () => {
    const { config } = check(good());
    const venmo = config.methods.find((m) => m.type === 'venmo');
    expect(venmo.display).toBe('@example-user');
    expect(venmo.href).toBe('https://venmo.com/u/example-user');
    const btc = config.methods.find((m) => m.type === 'bitcoin');
    expect(btc.href).toBe(`bitcoin:${TEST_BTC}`);
    expect(btc.copy).toBe(TEST_BTC);
  });

  it('checks the social icons and the photos', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'images-'));
    const cfg = good();
    cfg.brand.social = [{ type: 'myspace', url: 'https://example.com' }, { type: 'github' }];
    cfg.brand.portrait = 'missing.webp';
    const msg = joined(check(cfg, { imagesDir: dir }).errors);
    expect(msg).toMatch(/"myspace" isn't an icon this hub has/);
    expect(msg).toMatch(/social → github needs a url/);
    expect(msg).toMatch(/portrait: "missing.webp" isn't in the images folder/);
  });

  it('keeps the social icons in order with their names', () => {
    const cfg = good();
    cfg.brand.social = [{ type: 'github', url: 'https://example.com/gh' }, { type: 'youtube', url: 'https://example.com/yt' }];
    expect(check(cfg).config.brand.social.map((x) => x.label)).toEqual(['GitHub', 'YouTube']);
  });

  it('uses your own QR picture when one is named, and checks it exists', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'images-'));
    fs.writeFileSync(path.join(dir, 'paypal-qr.png'), 'png');
    const cfg = good();
    cfg.methods.push({ type: 'paypal', url: 'https://example.com/paypal-me', qr_image: 'paypal-qr.png' });
    const { config } = check(cfg, { imagesDir: dir });
    expect(config.methods.find((m) => m.type === 'paypal').qr_path).toBe('qr/paypal.png');
    expect(config.methods.find((m) => m.type === 'venmo').qr_path).toBe('qr/venmo.svg'); // made by the hub
    cfg.methods[cfg.methods.length - 1].qr_image = 'nope.png';
    expect(joined(check(cfg, { imagesDir: dir }).errors)).toMatch(/qr_image: "nope.png" isn't in the images folder/);
  });

  it('gives PayPal a QR code made from its PayPal.Me link', () => {
    const cfg = good();
    cfg.methods.push({ type: 'paypal', url: 'https://example.com/paypal-me' });
    const paypal = check(cfg).config.methods.find((m) => m.type === 'paypal');
    expect(paypal.qr).toBe('https://example.com/paypal-me');
  });

  it('warns about a section name it does not know (usually a typo)', () => {
    const cfg = { ...good(), tool: [] };
    expect(joined(check(cfg).warnings)).toMatch(/section called "tool"/);
  });

  it('explains broken YAML in plain words', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-')), 'config.yml');
    fs.writeFileSync(file, 'site:\n  url: "unclosed\nbrand: [\n');
    expect(joined(loadConfigFile(file).errors)).toMatch(/isn't valid YAML/);
  });

  it('accepts the real config.yml while working (placeholders are only warnings)', () => {
    const { raw } = loadConfigFile(path.join(ROOT, 'config.yml'));
    const { errors } = validateConfig(raw, {
      screenshotsDir: path.join(ROOT, 'screenshots'),
      imagesDir: path.join(ROOT, 'images'),
    });
    expect(errors).toEqual([]);
  });

  it('accepts the test fixture as a production config', () => {
    const { raw } = loadConfigFile(path.join(ROOT, 'tests/fixtures/config.yml'));
    expect(validateConfig(raw, { production: true }).errors).toEqual([]);
  });
});

describe('Stripe tagging', () => {
  it('adds the tool as client_reference_id', () => {
    expect(tagStripeUrl('https://example.com/stripe/5', 'my-tool'))
      .toBe('https://example.com/stripe/5?client_reference_id=my-tool');
  });

  it('keeps existing parameters and leaves placeholders alone', () => {
    expect(tagStripeUrl('https://example.com/s?x=1', 'a')).toBe('https://example.com/s?x=1&client_reference_id=a');
    expect(tagStripeUrl('<<STRIPE-LINK>>', 'a')).toBe('<<STRIPE-LINK>>');
    expect(tagStripeUrl('https://example.com/s', null)).toBe('https://example.com/s');
  });
});
