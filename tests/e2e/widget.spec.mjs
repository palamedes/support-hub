// Browser tests for the widget and the hub, run against a build of
// tests/fixtures/config.yml. A pretend "host tool" page is served for the
// tests that need one.

import { test, expect } from '@playwright/test';
import { buildWidget } from '../../scripts/build.mjs';
import { loadConfigFile, validateConfig } from '../../scripts/lib/config.mjs';

const ORIGIN = 'http://localhost:4173';
const STUB = '<script>window.supportHub=window.supportHub||function(){(supportHub.q=supportHub.q||[]).push(arguments)}</script>';

function hostPage({ attrs = 'data-tool="test-tool"', before = '', body = '' } = {}) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Host tool</title></head><body>
<h1>Host tool</h1>
<button id="tool-button" type="button">Export</button>
<p id="out"></p>
${body}
${STUB}
${before}
<script async src="/widget.js" ${attrs}></script>
<script>
  document.getElementById('tool-button').onclick = function () {
    document.getElementById('out').textContent = 'exported';
    supportHub('thanks');
  };
</script>
</body></html>`;
}

async function openHost(page, html, name = 'host.html') {
  await page.route(`**/${name}`, (route) => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto(`/${name}`);
}

const ready = (page) => page.waitForFunction(() => window.supportHub && window.supportHub.loaded === true);

/** Where focus really is, looking inside shadow roots. */
const focusInfo = (page) => page.evaluate(() => {
  let el = document.activeElement;
  while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
  return { inPanel: Boolean(el && el.closest && el.closest('.panel')), isTrigger: Boolean(el && el.classList.contains('trigger')) };
});

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

// Nothing may leave localhost: block and record every outside request.
test.beforeEach(async ({ context }) => {
  await context.route((url) => !url.href.startsWith(ORIGIN + '/'), (route) => route.abort());
});

test.describe('the panel', () => {
  test('opens from the keyboard, keeps focus inside, closes with Escape and returns focus', async ({ page }) => {
    const errors = collectErrors(page);
    await openHost(page, hostPage());
    await ready(page);

    await page.locator('.trigger').focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Support Test Tool' });
    await expect(dialog).toBeVisible();
    expect((await focusInfo(page)).inPanel).toBe(true);

    const stops = await dialog.locator('a[href]:visible, button:visible').count();
    for (let i = 0; i < stops + 3; i++) {
      await page.keyboard.press('Tab');
      expect((await focusInfo(page)).inPanel).toBe(true);
    }
    for (let i = 0; i < stops + 3; i++) {
      await page.keyboard.press('Shift+Tab');
      expect((await focusInfo(page)).inPanel).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    expect((await focusInfo(page)).isTrigger).toBe(true);
    expect(errors).toEqual([]);
  });

  test('"Leave a tip" opens the panel in the corner by the button, not mid-page', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openHost(page, hostPage());
    await ready(page);
    await page.click('#tool-button');
    await page.getByRole('button', { name: 'Leave a tip' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.waitForTimeout(250); // let the slide-in finish
    const box = await page.locator('.panel').boundingBox();
    expect(box.x).toBeGreaterThan(1280 / 2);
    expect(box.x + box.width).toBeGreaterThan(1280 - 40);
    expect(box.y + box.height).toBeGreaterThan(900 - 120);
    await expect(page.getByRole('region', { name: /A note from/ })).toBeHidden();
  });

  test('closes on a click outside it', async ({ page }) => {
    await openHost(page, hostPage());
    await ready(page);
    await page.evaluate(() => supportHub('open'));
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(dialog).toBeHidden();
  });

  test('shows every way to support at once, with no "More ways" step', async ({ page }) => {
    await openHost(page, hostPage());
    await ready(page);
    await page.evaluate(() => supportHub('open'));
    const dialog = page.getByRole('dialog');
    for (const name of ['$5', 'Ko-fi', 'Venmo']) {
      await expect(dialog.getByRole('link', { name: new RegExp(name.replace('$', '\\$')) }).first()).toBeVisible();
    }
    await expect(dialog.getByText('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4')).toBeVisible();
    await expect(dialog.getByText('tips@example.com')).toBeVisible();
    await expect(dialog.getByRole('button', { name: /More ways/ })).toHaveCount(0);
    // each method carries its logo, so people can see where a link goes
    await expect(dialog.getByRole('link', { name: 'Ko-fi' }).locator('svg.m-icon')).toHaveCount(1);
    await expect(dialog.locator('.method', { hasText: 'Bitcoin' }).first().locator('svg.m-icon')).toHaveCount(1);
  });

  test('a QR code opens big in a centered pop-up, by keyboard, and loads only then, from the hub', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    await openHost(page, hostPage());
    await ready(page);
    await page.evaluate(() => supportHub('open'));
    expect(requests.some((u) => u.includes('/qr/'))).toBe(false);

    const button = page.getByRole('button', { name: 'QR code for Venmo' });
    await expect(button.locator('svg')).toHaveCount(1); // the little QR glyph
    await button.focus();
    await page.keyboard.press('Enter');
    const popup = page.getByRole('dialog', { name: 'Venmo' });
    await expect(popup).toBeVisible();
    await expect(popup.getByRole('img', { name: 'QR code for Venmo' })).toBeVisible();
    expect(requests).toContain(`${ORIGIN}/qr/venmo.svg`);
    expect(requests.some((u) => u.includes('/qr/bitcoin.svg'))).toBe(false); // only the one asked for
    expect(requests.every((u) => u.startsWith(ORIGIN + '/'))).toBe(true);

    await page.waitForTimeout(250); // let the pop-in finish
    const box = await page.locator('.qr-dialog').boundingBox();
    expect(Math.abs(box.x + box.width / 2 - 640)).toBeLessThan(20);
    expect(Math.abs(box.y + box.height / 2 - 450)).toBeLessThan(40);

    // Tab stays inside the pop-up; Escape closes only the pop-up and returns to the button.
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => {
        let el = document.activeElement;
        while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
        return Boolean(el.closest('.qr-dialog'));
      })).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(popup).toBeHidden();
    await expect(page.getByRole('dialog', { name: 'Support Test Tool' })).toBeVisible();
    await expect(button).toBeFocused();
  });

  test('a click outside the QR pop-up closes just the pop-up', async ({ page }) => {
    await openHost(page, hostPage());
    await ready(page);
    await page.evaluate(() => supportHub('open'));
    await page.getByRole('button', { name: 'QR code for Bitcoin' }).click();
    const popup = page.getByRole('dialog', { name: 'Bitcoin' });
    await expect(popup).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(popup).toBeHidden();
    await expect(page.getByRole('dialog', { name: 'Support Test Tool' })).toBeVisible();
  });

  test('tags Stripe links with the tool so the payment records where it came from', async ({ page }) => {
    await openHost(page, hostPage());
    await ready(page);
    await page.evaluate(() => supportHub('open'));
    await expect(page.getByRole('link', { name: '$5', exact: true }))
      .toHaveAttribute('href', 'https://example.com/stripe/one-time-5?client_reference_id=test-tool');
  });

  test('fits a phone screen with no sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openHost(page, hostPage());
    await ready(page);
    await page.evaluate(() => supportHub('open'));
    const box = await page.locator('.panel').boundingBox();
    expect(box.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test('follows dark mode', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'dark' });
    const page = await context.newPage();
    await openHost(page, hostPage());
    await ready(page);
    await page.evaluate(() => supportHub('open'));
    const bg = await page.locator('.panel').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe('rgb(32, 32, 39)');
    await context.close();
  });
});

test.describe('placement', () => {
  test('data-mount puts the button inside the page\'s own element', async ({ page }) => {
    await openHost(page, hostPage({ attrs: 'data-tool="test-tool" data-mount="#slot"', body: '<div id="slot"></div>' }));
    await ready(page);
    await expect(page.locator('.trigger')).toHaveCount(1);
    await expect(page.locator('#slot .trigger')).toBeVisible();
    await page.locator('#slot .trigger').click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('data-position="none" adds no button, and the page opens the panel itself', async ({ page }) => {
    await openHost(page, hostPage({ attrs: 'data-tool="test-tool" data-position="none"' }));
    await ready(page);
    await expect(page.locator('.trigger')).toHaveCount(0);
    await page.evaluate(() => supportHub('open'));
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('calls made before the widget loads wait in line and still work', async ({ page }) => {
    await openHost(page, hostPage({ before: '<script>supportHub("thanks")</script>' }));
    await ready(page);
    await expect(page.getByRole('region', { name: /A note from/ })).toBeVisible();
  });
});

test.describe('the thank-you note', () => {
  test('shows after a success, fades by itself, then waits 30 days', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-01-01T10:00:00Z') });
    await openHost(page, hostPage());
    await ready(page);

    await page.click('#tool-button');
    await expect(page.locator('#out')).toHaveText('exported');
    const note = page.getByRole('region', { name: /A note from/ });
    await expect(note).toBeVisible();
    await expect(note).toContainText('Glad Test Tool worked!');

    await page.clock.runFor(11_000); // fade_seconds is 10 in the test config
    await expect(note).toBeHidden();

    expect(await page.evaluate(() => supportHub('thanks'))).toBe(false);
    await page.clock.setSystemTime(new Date('2026-01-30T10:00:00Z'));
    expect(await page.evaluate(() => supportHub('thanks'))).toBe(false);
    await page.clock.setSystemTime(new Date('2026-01-31T10:00:01Z'));
    expect(await page.evaluate(() => supportHub('thanks'))).toBe(true);
  });

  test('can be dismissed, and never blocks the page', async ({ page }) => {
    await openHost(page, hostPage());
    await ready(page);
    await page.click('#tool-button');
    const note = page.getByRole('region', { name: /A note from/ });
    await expect(note).toBeVisible();
    await page.click('#tool-button'); // the tool keeps working while it's up
    await note.getByRole('button', { name: 'Dismiss' }).click();
    await expect(note).toBeHidden();
  });

  test('"Don\'t show again" turns it off for good', async ({ page }) => {
    await openHost(page, hostPage());
    await ready(page);
    await page.click('#tool-button');
    await page.getByRole('button', { name: 'Don\'t show again' }).click();
    await page.reload();
    await ready(page);
    expect(await page.evaluate(() => supportHub('thanks'))).toBe(false);
  });

  test('never shows again for someone who clicked a support option', async ({ page, context }) => {
    await openHost(page, hostPage());
    await ready(page);
    await page.evaluate(() => supportHub('open'));
    const popup = context.waitForEvent('page');
    await page.getByRole('link', { name: 'Ko-fi' }).click();
    await (await popup).close();
    expect(await page.evaluate(() => supportHub('thanks'))).toBe(false);
  });

  test('can be switched off in the config', async ({ page }) => {
    const { raw } = loadConfigFile('tests/fixtures/config.yml');
    raw.thanks.enabled = false;
    const code = await buildWidget(validateConfig(raw).config);
    await page.route('**/widget.js', (route) => route.fulfill({ contentType: 'text/javascript', body: code }));
    await openHost(page, hostPage());
    await ready(page);
    expect(await page.evaluate(() => supportHub('thanks'))).toBe(false);
  });
});

test.describe('when things go wrong', () => {
  test('blocked storage: no errors, and the note shows at most once per visit', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() { throw new DOMException('Storage is blocked', 'SecurityError'); },
      });
    });
    const errors = collectErrors(page);
    await openHost(page, hostPage());
    await ready(page);
    expect(await page.evaluate(() => supportHub('thanks'))).toBe(true);
    expect(await page.evaluate(() => supportHub('thanks'))).toBe(false);
    await page.evaluate(() => supportHub('open'));
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('hub unreachable: the tool keeps working with no errors', async ({ page }) => {
    await page.route('**/widget.js', (route) => route.abort());
    const errors = collectErrors(page);
    await openHost(page, hostPage());
    await page.click('#tool-button');
    await expect(page.locator('#out')).toHaveText('exported');
    await page.evaluate(() => { supportHub('open'); supportHub('thanks'); });
    await expect(page.locator('[data-support-hub]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('nothing outside the hub is contacted until a support link is clicked', async ({ page }) => {
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    await openHost(page, hostPage());
    await ready(page);
    await page.evaluate(() => supportHub('open'));
    for (const button of await page.locator('.qr-btn').all()) {
      await button.click();
      await expect(page.locator('.qr-dialog')).toBeVisible();
      await page.keyboard.press('Escape');
    }
    await page.keyboard.press('Escape');
    await page.click('#tool-button');
    await expect(page.getByRole('region', { name: /A note from/ })).toBeVisible();
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.filter((u) => !u.startsWith(ORIGIN + '/'))).toEqual([]);
  });
});

test.describe('the hub site', () => {
  test('the big Support button on the home page opens the widget panel', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.supportHub && window.supportHub.loaded === true);
    await expect(page.locator('.trigger')).toHaveCount(0); // no corner button on the hub itself
    await page.locator('main').getByRole('link', { name: 'Support', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Support the tools' })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test('on a tool page the button opens the panel for that tool', async ({ page }) => {
    await page.goto('/tools/test-tool/');
    await page.waitForFunction(() => window.supportHub && window.supportHub.loaded === true);
    await page.locator('main').getByRole('link', { name: 'Support', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Support Test Tool' })).toBeVisible();
  });

  test('if the widget can\'t load, the Support button goes to the support page', async ({ page }) => {
    await page.route('**/widget.js', (route) => route.abort());
    await page.goto('/');
    await page.locator('main').getByRole('link', { name: 'Support', exact: true }).click();
    await expect(page).toHaveURL(/\/support\/$/);
  });

  test('?from= thanks the visitor for that tool and tags the Stripe links', async ({ page }) => {
    await page.goto('/support/?from=test-tool');
    await expect(page.locator('#from-note')).toHaveText('Glad Test Tool worked!');
    await expect(page.getByRole('link', { name: '$5', exact: true }))
      .toHaveAttribute('href', /client_reference_id=test-tool/);
  });

  test('copy buttons copy the address', async ({ browser }) => {
    const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    await page.goto(`${ORIGIN}/support/`);
    const bitcoin = page.locator('.method', { hasText: 'Bitcoin' }).first();
    await bitcoin.getByRole('button', { name: 'Copy address' }).click();
    await expect(bitcoin.getByRole('button', { name: 'Copied' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText()))
      .toBe('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4');
    await context.close();
  });

  test('every page loads with no errors', async ({ page }) => {
    const errors = collectErrors(page);
    for (const path of ['/', '/support/', '/tools/test-tool/', '/thanks/', '/demo/']) {
      const res = await page.goto(path);
      expect(res.status(), path).toBe(200);
    }
    expect(errors).toEqual([]);
  });
});
