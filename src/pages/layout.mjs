import { esc } from './parts.mjs';

/**
 * Wraps a page body in the shared head, header and footer.
 * @param {object} cfg - the checked config
 * @param {{title: string, description: string, path: string, body: string,
 *          noindex?: boolean, script?: string, data?: object}} page
 */
export function layout(cfg, page) {
  const { site, brand } = cfg;
  const title = page.title === site.title ? site.title : `${page.title} · ${site.title}`;
  const canonical = site.url + page.path;
  const aka = brand.also_known_as.length
    ? `<span class="aka">aka ${brand.also_known_as.map(esc).join(' · ')}</span>`
    : '';
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
<meta name="color-scheme" content="light dark">
${page.noindex ? '<meta name="robots" content="noindex">\n' : ''}<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/styles.css">
${page.data ? `<script type="application/json" id="hub-data">${JSON.stringify(page.data).replace(/</g, '\\u003c')}</script>\n` : ''}${page.script ? `<script src="${page.script}" defer></script>\n` : ''}<!-- ─── Optional visit counter ───────────────────────────────────────────
     Off by default. To turn one on, paste its snippet into
     site → analytics_snippet in config.yml. Pick a cookie-free one.
     ─────────────────────────────────────────────────────────────────── -->
${site.analytics_snippet}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="inner">
    <a class="brand" href="/"><span class="name">${esc(brand.name)}</span>${aka}</a>
    <nav aria-label="Main">
      <a href="/#tools">Tools</a>
      <a href="/support/">Support</a>
      ${brand.about_url ? `<a href="${esc(brand.about_url)}">About me</a>` : ''}
    </nav>
  </div>
</header>
<main id="main" class="inner">
${page.body}
</main>
<footer class="site-footer">
  <div class="inner">
    <p>© ${new Date().getFullYear()} ${esc(brand.name)}. Every tool here is free, with nothing locked.
    This site sets no cookies and doesn't track you.</p>
  </div>
</footer>
</body>
</html>
`;
}
