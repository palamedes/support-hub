# Support hub

One place for all of my free tools, and one quiet **Support** button that any
of them can add. It has two parts:

1. **The hub website** at <https://tools.randomstringofwords.com>. It lists
   every tool and every way to leave a tip.
2. **The widget**, a single small file (`widget.js`, about 6 KB). A tool adds
   it with one script tag, and it puts a small Support button on the page.

Both come from one file, **`config.yml`**. Change a link there, push, and the
hub and every tool pick it up within about 10 minutes.

Supporting is always optional. Nothing is locked, nothing pops up on its own,
and nothing nags. It's also never called a donation: I'm not a charity, and
tips aren't tax-deductible.

---

## Contents

- [Previewing it on your computer](#previewing-it-on-your-computer)
- [Filling in config.yml](#filling-in-configyml)
- [Stripe Payment Links](#stripe-payment-links)
- [Publishing the site](#publishing-the-site)
- [Adding the widget to a tool](#adding-the-widget-to-a-tool)
- [Adding a new tool to the hub](#adding-a-new-tool-to-the-hub)
- [Before you switch on PayPal, Venmo, Cash App or Bitcoin](#before-you-switch-on-paypal-venmo-cash-app-or-bitcoin)
- [Privacy](#privacy)
- [Tests](#tests)
- [What's in this folder](#whats-in-this-folder)

---

## Previewing it on your computer

You need [Node.js](https://nodejs.org) 20 or newer. Then, in this folder:

```bash
npm install     # once, the first time
npm run dev     # builds the site and serves it at http://localhost:8080
```

Open <http://localhost:8080> for the hub and <http://localhost:8080/demo/> to
try the widget. While `npm run dev` is running, saving `config.yml` rebuilds the
site; refresh the browser to see the change.

---

## Filling in config.yml

`config.yml` is commented line by line, so it's the best guide. In short:

- **site**: the hub's address and title. Leave these alone.
- **brand**: your name, the "aka" line, the short intro, the pitch next to the
  support options, what tips pay for, and the not-tax-deductible note.
- **thanks**: the thank-you note a tool can show after something works (see
  [the widget](#the-thank-you-note)). `interval_days` is how long to wait
  before showing it again for the same tool.
- **tools**: one entry per tool. See [Adding a new tool](#adding-a-new-tool-to-the-hub).
- **methods**: the ways to support, in the order they appear.
  - `primary: true` puts a method up front. Everything else sits behind
    "More ways to support". Two or three primary methods is plenty.
  - `enabled: false` hides a method everywhere.

**Placeholders** look like `<<YOUR-KOFI-NAME>>`. Every method that still has
one starts switched off. To turn one on:

1. Replace the placeholder with the real link, handle or address.
2. Change its `enabled: false` to `enabled: true`.
3. Run `npm run check`. It says either "config.yml looks good" or exactly
   what's wrong and where.

The live site won't build while an enabled method still has a placeholder.
That's on purpose, so a `<<PLACEHOLDER>>` can never reach a real visitor.

| Method | What to paste |
| --- | --- |
| Stripe | Payment Links. See [Stripe Payment Links](#stripe-payment-links) below. |
| Ko-fi | Your page link, like `https://ko-fi.com/yourname` |
| Patreon | Already filled in: `https://www.patreon.com/palamedes` |
| PayPal | Your PayPal.Me link, like `https://paypal.me/yourname` |
| Venmo | Your username, without the @. The link and QR code are made from it. |
| Cash App | Your cashtag, without the $. |
| Bitcoin | A receiving address from your wallet (starts with `bc1`, `1` or `3`). |
| Lightning | Your Lightning address, which looks like an email: `name@provider.com` |
| GitHub Sponsors | `https://github.com/sponsors/palamedes`, once Sponsors is set up |

> Never paste a private key, seed phrase or recovery words anywhere in this
> project. A receiving address is all it needs, and it's safe to share.

---

## Stripe Payment Links

Stripe handles the card, Apple Pay and Google Pay side. A **Payment Link** is a
checkout page Stripe hosts for you. The hub only links to it, and never sees a
card number.

### One-time tips ($3, $5, $10)

1. In the [Stripe Dashboard](https://dashboard.stripe.com), go to
   **Payment Links** and create a new one.
2. Choose **Products or subscriptions** and add a product, such as "Tip".
   Give it a **one-time** price of $3.
3. On the **After payment** tab, choose to redirect customers to your website,
   and enter `https://tools.randomstringofwords.com/thanks/`
4. Create the link and copy it. It starts with `https://buy.stripe.com/`.
5. Paste it into `config.yml` under `one_time`, next to `amount: 3`.
6. Repeat for $5 and $10.

### "Choose your own amount"

Create one more Payment Link, but choose **Customers choose what to pay**
instead of a fixed price. You can set a suggested amount and a minimum. Paste
it as `choose_your_own_url`.

### Monthly tips

Create links the same way, but give the price a **recurring, monthly**
schedule. Paste them under `monthly`.

Monthly tips can only use fixed amounts. Stripe's "customers choose what to
pay" option works for one-time payments only.

### Apple Pay and Google Pay

Under **Settings → Payment methods**, check that Apple Pay and Google Pay are
on. Payment Links show them automatically on phones and browsers that
support them.

Under **Settings → Public details**, set a statement descriptor people will
recognize on their card statement, such as `JASON ELLIS TOOLS`.

### Which tool earned the tip

The widget, and the hub when a visitor arrives with `?from=<tool-id>`, add
`client_reference_id=<tool-id>` to every Stripe link. Stripe saves that value
with the payment's checkout session. It shows up in the
`checkout.session.completed` event in your Dashboard's event log, so you can
see that a tip came from, say, `coin-depth-mapper`. You don't need to do
anything to set this up.

---

## Publishing the site

The site is published by GitHub Pages, for free. Every push to `main` runs
`.github/workflows/deploy.yml`. That workflow checks `config.yml` with the
strict rules, runs the tests, builds the site and publishes it. It takes about
a minute. The **Actions** tab on GitHub shows each run. A red X means the
check found a problem, and the log says what it is.

### One-time setup

- **GitHub Pages**: in the repository's **Settings → Pages**, the source is
  **GitHub Actions** and the custom domain is `tools.randomstringofwords.com`,
  with **Enforce HTTPS** ticked.
- **DNS**: the domain's DNS is at Namecheap. In **Domain List → Manage →
  Advanced DNS**, there's one record:

  | Type | Host | Value |
  | --- | --- | --- |
  | CNAME | `tools` | `palamedes.github.io.` |

  Once that record is in place, it can take up to an hour for the address to
  work and for GitHub to issue the HTTPS certificate.

---

## Adding the widget to a tool

Paste these two lines into the tool's page, just before `</body>`. Change
`coin-depth-mapper` to the tool's `id` from `config.yml`:

```html
<script>window.supportHub=window.supportHub||function(){(supportHub.q=supportHub.q||[]).push(arguments)}</script>
<script async src="https://tools.randomstringofwords.com/widget.js" data-tool="coin-depth-mapper"></script>
```

The first line makes `supportHub(...)` safe to call at any moment: before the
widget has loaded, and even if the hub is down or the computer is offline. In
those cases the calls do nothing, and the tool carries on normally.

### Options

Add any of these to the second `<script>` tag:

| Attribute | What it does |
| --- | --- |
| `data-tool="id"` | Which tool this is. It sets the panel's title and wording, and tags Stripe links. |
| `data-position="bottom-left"` | Corner for the button: `bottom-right` (the default), `bottom-left`, `top-right` or `top-left`. |
| `data-position="none"` | No button at all. The tool opens the panel from its own link. |
| `data-mount="#my-spot"` | Puts the button inside an element on the page, instead of a corner. |
| `data-label="Tip jar"` | Changes the button's text (the default is "Support"). |
| `data-theme="dark"` | Forces light or dark. The default follows the visitor's setting. |

### Opening the panel from the tool's own link

```html
<a href="https://tools.randomstringofwords.com/support/?from=coin-depth-mapper"
   target="_blank" rel="noopener"
   onclick="if (window.supportHub && supportHub.loaded) { supportHub('open'); return false; }">
  Support this tool
</a>
```

If the widget loaded, this opens the panel. If it didn't (for example, the
person is offline), it's an ordinary link to the support page.

### The thank-you note

After something works in the tool (an export finishes, a file saves), call:

```js
supportHub('thanks');
```

That may show a one-line note in the corner: "Glad it worked! If this tool
helped, you can leave a tip." The note:

- never blocks anything, and fades out by itself after a few seconds;
- can be dismissed with its × button (or Escape, once it has focus);
- shows at most once every 30 days per tool (`interval_days` in `config.yml`);
- never shows to someone who has clicked a support option;
- has a **Don't show again** button that turns it off for good.

It remembers all of this in the visitor's browser only (localStorage). If the
browser blocks storage, it still works, and shows at most once per visit.

To use different words for one moment: `supportHub('thanks', { message: 'Export done! …' })`.
To switch the note off everywhere, set `thanks: enabled: false` in `config.yml`.

In Relief Depth Studio, the natural spot is right after a depth map
exports successfully.

### Everything the widget can do

| Call | What it does |
| --- | --- |
| `supportHub('open')` | Opens the panel. |
| `supportHub('close')` | Closes it. |
| `supportHub('thanks')` | Maybe shows the thank-you note (see the rules above). Returns `true` if it showed. |
| `supportHub('reset')` | Forgets the note's memory in this browser. Handy while testing. |

### Offline and local tools

Relief Depth Studio runs on the user's own computer. The widget loads from
the hub, so it appears when the computer is online. When it's offline, the
button simply isn't there and nothing breaks.

---

## Adding a new tool to the hub

1. Pick a permanent `id`: lowercase letters, numbers and dashes, like
   `photo-squisher`. Don't change it later, because it's in the tool's script
   tag and in your Stripe records. The `name` can change any time.
2. Optionally, put a screenshot in the `screenshots/` folder. A wide image
   around 1200 pixels across works well, and WebP keeps it small.
3. Add an entry under `tools:` in `config.yml`:

   ```yaml
   - id: photo-squisher
     name: Photo Squisher
     description: Shrinks photos without making them look worse.
     url: https://example.com/photo-squisher
     screenshot: photo-squisher.webp
     page: true            # gives it a page at /tools/photo-squisher/
     thanks_text: Glad your photos came out small! If it helped, you can leave a tip.
   ```

4. Run `npm run check`, then push.
5. Add [the widget](#adding-the-widget-to-a-tool) to the tool with
   `data-tool="photo-squisher"`.

---

## Before you switch on PayPal, Venmo, Cash App or Bitcoin

**PayPal, Venmo and Cash App** each have rules about personal accounts
receiving money for a business or for goods and services, and tips for tools
you make can count. Read their current terms and decide whether you need a
business profile before switching them on. A personal account also shows your
real name to anyone who pays you.

**Bitcoin**: anyone can look up an on-chain address on the public blockchain.
If you reuse one address, as this hub does, every tip sent to it is visible
to anyone who knows the address: amounts, dates and your running total. Giving
each person a fresh address would need a server, which this hub deliberately
doesn't have. Use an address that's only for tips. **Lightning** payments
don't show up on the public blockchain the same way.

---

## Privacy

- The widget sets no cookies, has no tracking and no analytics, and needs no
  account or login.
- It makes no requests of its own. When someone opens "More ways to support",
  it loads QR code images from the hub, which is the same site the widget
  came from. Ko-fi, Stripe and the others are only contacted when someone
  clicks their link.
- The widget's styles sit in a Shadow DOM, so the tool's page and the widget
  can't break each other's looks.
- The hub has a clearly marked spot for an optional, cookie-free visit counter
  (`site → analytics_snippet` in `config.yml`). It's empty, so it's off. If
  you ever add one, it goes on the hub's pages only, never in the widget.

---

## Tests

```bash
npm test          # quick: config checks, the 30-day and "Don't show again" logic, blocked storage, size budget
npm run test:e2e  # in a real browser: keyboard use, the hub being down, blocked storage, no outside requests
```

The browser tests use their own fixed config (`tests/fixtures/config.yml`), so
editing your real `config.yml` won't break them. Both kinds run on GitHub on
every push. The widget must stay under 15 KB gzipped, and the build checks
that too.

---

## What's in this folder

```
config.yml            ← the one file you edit
screenshots/          ← one image per tool
src/widget/           ← the widget: widget.js, its styles, and the thank-you note's memory
src/pages/            ← the hub's pages
src/site/             ← the hub's stylesheet, its one small script, and the icon
scripts/build.mjs     ← reads config.yml, checks it, writes the finished site to dist/
scripts/lib/config.mjs← the config checks and their plain-English messages
scripts/serve.mjs     ← the local preview server
tests/                ← the tests
.github/workflows/    ← publishing (deploy.yml) and the browser tests (tests.yml)
```

`dist/` is the finished site. It's rebuilt every time, so never edit it by hand.
