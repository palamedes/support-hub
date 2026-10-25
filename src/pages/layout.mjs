import { esc } from './parts.mjs';
import { socialIcons } from './icons.mjs';

/**
 * Wraps a page body in the shared head, header and footer. The look follows
 * randomstringofwords.com: a slim header with the social icons, a dark hero
 * with a blue rule under it, white cards on light gray, and a dark footer.
 * @param {object} cfg - the checked config
 * @param {{title: string, description: string, path: string, body: string,
 *          section?: string, hero?: string, heading?: string,
 *          noindex?: boolean, script?: string, data?: object}} page
 *   `hero` replaces the page-title band (the home page uses it); `heading`
 *   is the title shown in that band.
 */
export function layout(cfg, page) {
  const { site, brand } = cfg;
  const title = page.title === site.title ? site.title : `${page.title} · ${site.title}`;
  const canonical = site.url + page.path;
  const band = page.hero ||
    `<section class="page-hero"><div class="wrap"><h1>${esc(page.heading || page.title)}</h1></div></section>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(page.description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:url" content="${esc(canonical)}">
${brand.portrait ? `<meta property="og:image" content="${esc(site.url)}/images/${esc(brand.portrait)}">\n` : ''}<meta name="color-scheme" content="light dark">
${page.noindex ? '<meta name="robots" content="noindex">\n' : ''}<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/fonts/nunito-sans.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/styles.css">
${page.data ? `<script type="application/json" id="hub-data">${JSON.stringify(page.data).replace(/</g, '\\u003c')}</script>\n` : ''}${page.script ? `<script src="${page.script}" defer></script>\n` : ''}<!-- ─── Optional visit counter ───────────────────────────────────────────
     Off by default. To turn one on, paste its snippet into
     site → analytics_snippet in config.yml. Pick a cookie-free one.
     ─────────────────────────────────────────────────────────────────── -->
${site.analytics_snippet}
</head>
<body id="top">
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="site-title" href="/">${esc(site.name)} <span>| ${esc(page.section || page.title)}</span></a>
    <nav class="nav-links" aria-label="Main">
      <a href="/#tools">Tools</a>
      <a href="/support/">Support</a>
      ${brand.blog_url ? `<a href="${esc(brand.blog_url)}">Blog</a>` : ''}
      ${brand.about_url ? `<a href="${esc(brand.about_url)}">About Me</a>` : ''}
    </nav>
    <div class="social-icons">${socialIcons(cfg)}</div>
  </div>
</header>
${band}
<div class="sub-hero" aria-hidden="true"></div>
<main id="main" class="wrap">
${page.body}
</main>
<footer>
  <div class="footer-main">
    <div class="wrap footer-about">
      ${brand.footer_photo ? `<img class="footer-about-img" src="/images/${esc(brand.footer_photo)}" width="140" height="140" alt="${esc(brand.name)}" loading="lazy" decoding="async">` : ''}
      <div class="footer-about-text">
        <h2>About Me</h2>
        ${brand.footer_about ? `<p>${esc(brand.footer_about)}</p>` : ''}
        <div class="footer-about-actions">
          ${brand.about_url ? `<a class="read-more" href="${esc(brand.about_url)}">More about me</a>` : ''}
          <div class="footer-social">${socialIcons(cfg)}</div>
        </div>
      </div>
    </div>
  </div>
  <div class="footer-bottom">
    <div class="wrap footer-bottom-inner">
      <p>© ${new Date().getFullYear()} ${esc(brand.name)}. Every tool here is free, with nothing locked. This site sets no cookies and doesn't track you.</p>
      <a class="back-to-top" href="#top" aria-label="Back to top">▲</a>
    </div>
  </div>
</footer>
</body>
</html>
`;
}
