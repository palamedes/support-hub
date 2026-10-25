// Every page on the hub. Each function returns { path, file, html }.

import { layout } from './layout.mjs';
import { esc, paysFor, screenshot, supportOptions } from './parts.mjs';

const toolData = (cfg) => ({
  tools: Object.fromEntries(cfg.tools.map((t) => [t.id, { name: t.name, thanks_text: t.thanks_text }])),
});

function toolCard(tool) {
  return `<article class="card">
  ${screenshot(tool)}
  <div class="card-body">
    <h3>${esc(tool.name)}</h3>
    ${tool.description ? `<p>${esc(tool.description)}</p>` : ''}
    <p class="card-links">
      <a class="btn pay" href="${esc(tool.url)}">Open ${esc(tool.name)}</a>
      ${tool.page ? `<a href="/tools/${esc(tool.id)}/">More about ${esc(tool.name)}</a>` : ''}
    </p>
  </div>
</article>`;
}

export function homePage(cfg) {
  const { brand } = cfg;
  const body = `
<section class="hero">
  <h1>Free tools by ${esc(brand.name)}</h1>
  ${brand.intro ? `<p class="lead">${esc(brand.intro)}</p>` : ''}
  ${brand.about_url ? `<p><a href="${esc(brand.about_url)}">More about me</a></p>` : ''}
</section>

<section id="tools" aria-labelledby="tools-title">
  <h2 id="tools-title">Tools</h2>
  ${cfg.tools.length
    ? `<div class="cards">${cfg.tools.map(toolCard).join('\n')}</div>`
    : '<p>The first tools are on their way.</p>'}
</section>

<section id="support" class="support-box" aria-labelledby="support-title">
  <h2 id="support-title">Support the tools</h2>
  <p>${esc(brand.pitch)}</p>
  ${paysFor(cfg)}
  ${supportOptions({ ...cfg, methods: cfg.methods.filter((m) => m.primary) })}
  <p><a href="/support/">See every way to support</a></p>
</section>`;
  return {
    path: '/',
    file: 'index.html',
    html: layout(cfg, {
      title: cfg.site.title,
      description: `Free tools by ${brand.name}, with no ads, watermarks or locked features, and an optional way to leave a tip.`,
      path: '/',
      body,
    }),
  };
}

export function supportPage(cfg, qr) {
  const body = `
<h1>Support the tools</h1>
<p class="from-note" id="from-note" hidden></p>
<p class="lead">${esc(cfg.brand.pitch)}</p>
${paysFor(cfg)}
${supportOptions(cfg, { qr })}
<p class="fine">${esc(cfg.brand.tax_note)}</p>`;
  return {
    path: '/support/',
    file: 'support/index.html',
    html: layout(cfg, {
      title: 'Support',
      description: `Every way to leave a tip for ${cfg.brand.name}'s free tools: card, Ko-fi, Patreon and more. Always optional.`,
      path: '/support/',
      body,
      script: '/hub.js',
      data: toolData(cfg),
    }),
  };
}

export function toolPage(cfg, tool, qr) {
  const body = `
<p class="crumbs"><a href="/#tools">All tools</a></p>
<h1>${esc(tool.name)}</h1>
${tool.description ? `<p class="lead">${esc(tool.description)}</p>` : ''}
${screenshot(tool)}
<p><a class="btn pay" href="${esc(tool.url)}">Open ${esc(tool.name)}</a></p>

<section class="support-box" aria-labelledby="support-title">
  <h2 id="support-title">Support ${esc(tool.name)}</h2>
  <p>${esc(tool.thanks_text || cfg.brand.pitch)}</p>
  ${paysFor(cfg)}
  ${supportOptions(cfg, { toolId: tool.id, qr })}
  <p class="fine">${esc(cfg.brand.tax_note)}</p>
</section>`;
  return {
    path: `/tools/${tool.id}/`,
    file: `tools/${tool.id}/index.html`,
    html: layout(cfg, {
      title: tool.name,
      description: tool.description || `${tool.name}, a free tool by ${cfg.brand.name}.`,
      path: `/tools/${tool.id}/`,
      body,
      script: '/hub.js',
    }),
  };
}

export function thanksPage(cfg) {
  const body = `
<section class="hero">
  <h1>Thank you!</h1>
  <p class="lead">Your tip went through. It keeps these tools free and running, and it pays for
  the next one. I really appreciate it.</p>
  <p><a href="/#tools">Back to the tools</a></p>
</section>`;
  return {
    path: '/thanks/',
    file: 'thanks/index.html',
    html: layout(cfg, {
      title: 'Thank you',
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
<h1>Widget demo</h1>
<p class="lead">This plain page loads the Support widget the same way a tool would.
The quiet <strong>Support</strong> button is in the bottom-right corner.</p>

<div class="demo-actions">
  <button type="button" class="btn pay" id="demo-open">Open the panel</button>
  <button type="button" class="btn" id="demo-thanks">Show the thank-you note</button>
  <button type="button" class="btn" id="demo-reset">Reset the note's memory</button>
</div>
<p class="fine" id="demo-result" role="status"></p>

<h2>The snippet</h2>
<pre><code>${esc(snippet)}</code></pre>
<p>The thank-you note shows at most once every ${cfg.thanks.interval_days} days per tool, so use
<em>Reset</em> to see it again.</p>

<script>window.supportHub=window.supportHub||function(){(supportHub.q=supportHub.q||[]).push(arguments)}</script>
<script async src="/widget.js" data-tool="${esc(id)}"></script>
<script>
  document.getElementById('demo-open').onclick = function () { supportHub('open'); };
  document.getElementById('demo-thanks').onclick = function () {
    var shown = supportHub('thanks');
    document.getElementById('demo-result').textContent = shown
      ? 'Shown.'
      : 'Not shown: it already showed recently, "Don\\'t show again" was clicked, or a support option was clicked. Reset to try again.';
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
<section class="hero">
  <h1>Page not found</h1>
  <p class="lead">That page isn't here. It may have moved.</p>
  <p><a href="/">Go to the home page</a></p>
</section>`;
  return {
    path: '/404.html',
    file: '404.html',
    html: layout(cfg, {
      title: 'Not found',
      description: 'Page not found.',
      path: '/404.html',
      body,
      noindex: true,
    }),
  };
}
