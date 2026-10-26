// Every page on the hub. Each function returns { path, file, html }.

import { layout } from './layout.mjs';
import { esc, heading, paysFor, screenshot, supportButton, supportOptions } from './parts.mjs';

const toolData = (cfg) => ({
  tools: Object.fromEntries(cfg.tools.map((t) => [t.id, { name: t.name, thanks_text: t.thanks_text }])),
});

function toolCard(tool) {
  return `<article class="tool-card">
  ${screenshot(tool, 'card-image')}
  <div class="card-body">
    <h3 class="card-title">${esc(tool.name)}</h3>
    ${tool.description ? `<p class="card-excerpt">${esc(tool.description)}</p>` : ''}
    <p class="card-links">
      <a class="btn pay" href="${esc(tool.url)}">Open ${esc(tool.name)}</a>
      ${tool.page ? `<a href="/tools/${esc(tool.id)}/">More about ${esc(tool.name)}</a>` : ''}
    </p>
  </div>
</article>`;
}

function homeHero(cfg) {
  const { brand, site } = cfg;
  return `<section class="home-hero">
  <div class="hero-inner">
    ${brand.portrait ? `<img class="profile-image" src="/images/${esc(brand.portrait)}" width="250" height="250" alt="${esc(brand.name)}">` : ''}
    <div class="hero-text">
      <h1 class="hero-name">${esc(brand.name)}</h1>
      <p class="hero-site-name">${esc(site.name)}</p>
      ${brand.also_known_as.length ? `<p class="hero-aka">aka ${brand.also_known_as.map(esc).join(' · ')}</p>` : ''}
      ${brand.intro ? `<p class="hero-tagline">${esc(brand.intro)}</p>` : ''}
    </div>
  </div>
</section>`;
}

export function homePage(cfg) {
  const { brand } = cfg;
  const listed = cfg.tools.filter((t) => t.listed); // `listed: false` sites use the widget but aren't tools
  const body = `
<section id="tools" aria-labelledby="tools-title">
  ${heading('Tools', 'tools-title')}
  ${listed.length
    ? `<div class="tool-grid">${listed.map(toolCard).join('\n')}</div>`
    : '<p>The first tools are on their way.</p>'}
</section>

<section id="support" aria-labelledby="support-title">
  ${heading('Support the tools', 'support-title')}
  <div class="card-panel">
    <p>${esc(brand.pitch)}</p>
    ${paysFor(cfg)}
    ${supportButton(null)}
  </div>
</section>`;
  return {
    path: '/',
    file: 'index.html',
    html: layout(cfg, {
      title: cfg.site.title,
      section: 'Home',
      description: `Free tools by ${brand.name}, with no watermarks or locked features, and an optional way to leave a tip.`,
      path: '/',
      hero: homeHero(cfg),
      body,
      script: '/hub.js',
      widget: {},
    }),
  };
}

export function supportPage(cfg, qr) {
  const body = `
<div class="card-panel support-page">
  <p class="from-note" id="from-note" hidden></p>
  <p class="lead">${esc(cfg.brand.pitch)}</p>
  ${paysFor(cfg)}
  ${supportOptions(cfg, { qr })}
  <p class="fine">${esc(cfg.brand.tax_note)}</p>
</div>`;
  return {
    path: '/support/',
    file: 'support/index.html',
    html: layout(cfg, {
      title: 'Support',
      heading: 'Support the tools',
      description: `Every way to leave a tip for ${cfg.brand.name}'s free tools: card, Ko-fi, Patreon and more. Always optional.`,
      path: '/support/',
      body,
      script: '/hub.js',
      data: toolData(cfg),
    }),
  };
}

export function toolPage(cfg, tool) {
  const body = `
<p class="crumbs"><a href="/#tools">All tools</a></p>
<div class="card-panel">
  ${tool.description ? `<p class="lead">${esc(tool.description)}</p>` : ''}
  ${screenshot(tool)}
  <p><a class="btn pay" href="${esc(tool.url)}">Open ${esc(tool.name)}</a></p>
</div>

<section aria-labelledby="support-title">
  ${heading(`Support ${tool.name}`, 'support-title')}
  <div class="card-panel">
    <p>${esc(tool.thanks_text || cfg.brand.pitch)}</p>
    ${paysFor(cfg)}
    ${supportButton(tool.id)}
  </div>
</section>`;
  return {
    path: `/tools/${tool.id}/`,
    file: `tools/${tool.id}/index.html`,
    html: layout(cfg, {
      title: tool.name,
      section: 'Tools',
      description: tool.description || `${tool.name}, a free tool by ${cfg.brand.name}.`,
      path: `/tools/${tool.id}/`,
      body,
      script: '/hub.js',
      widget: { tool: tool.id },
    }),
  };
}

export function thanksPage(cfg) {
  const body = `
<div class="card-panel">
  <p class="lead">Your tip went through. It keeps these tools free and running, and it pays for
  the next one. I really appreciate it.</p>
  <p><a href="/#tools">Back to the tools</a></p>
</div>`;
  return {
    path: '/thanks/',
    file: 'thanks/index.html',
    html: layout(cfg, {
      title: 'Thank you',
      heading: 'Thank you!',
      description: 'Thanks for the tip.',
      path: '/thanks/',
      body,
      noindex: true,
    }),
  };
}

export function demoPage(cfg) {
  const tool = cfg.tools[0];
  const id = tool ? tool.id : 'my-tool';
  const snippet =
`<script>window.supportHub=window.supportHub||function(){(supportHub.q=supportHub.q||[]).push(arguments)}</script>
<script async src="${cfg.site.url}/widget.js" data-tool="${id}"></script>`;
  const body = `
<div class="card-panel">
  <p class="lead">This page loads the Support widget the same way a tool would.
  The quiet <strong>Support</strong> button is in the bottom-right corner.</p>

  <div class="demo-actions">
    <button type="button" class="btn pay" id="demo-open">Open the panel</button>
    <button type="button" class="btn" id="demo-thanks">Show the thank-you note</button>
    <button type="button" class="btn" id="demo-reset">Reset the note's memory</button>
  </div>
  <p class="fine" id="demo-result" role="status"></p>

  <h2>The snippet</h2>
  <pre><code>${esc(snippet)}</code></pre>
  <p>${cfg.thanks.interval_days
    ? `The thank-you note shows at most once every ${cfg.thanks.interval_days} days per tool.`
    : 'The thank-you note shows after every success.'}
  Once you click <em>Don't show again</em> or a tip link, it stops; use <em>Reset</em> to bring it back.</p>
</div>

<script>window.supportHub=window.supportHub||function(){(supportHub.q=supportHub.q||[]).push(arguments)}</script>
<script async src="/widget.js" data-tool="${esc(id)}"></script>
<script>
  document.getElementById('demo-open').onclick = function () { supportHub('open'); };
  document.getElementById('demo-thanks').onclick = function () {
    var shown = supportHub('thanks');
    document.getElementById('demo-result').textContent = shown
      ? 'Shown.'
      : 'Not shown: "Don\\'t show again" or a tip link was clicked${cfg.thanks.interval_days ? ', or it showed recently' : ''}. Reset to try again.';
  };
  document.getElementById('demo-reset').onclick = function () {
    supportHub('reset');
    document.getElementById('demo-result').textContent = 'Reset. The note will show on the next try.';
  };
</script>`;
  return {
    path: '/demo/',
    file: 'demo/index.html',
    html: layout(cfg, {
      title: 'Widget demo',
      description: 'A plain page that loads the Support widget.',
      path: '/demo/',
      body,
      noindex: true,
    }),
  };
}

export function notFoundPage(cfg) {
  const body = `
<div class="card-panel">
  <p class="lead">That page isn't here. It may have moved.</p>
  <p><a href="/">Go to the home page</a></p>
</div>`;
  return {
    path: '/404.html',
    file: '404.html',
    html: layout(cfg, {
      title: 'Not found',
      heading: 'Page not found',
      description: 'Page not found.',
      path: '/404.html',
      body,
      noindex: true,
    }),
  };
}
