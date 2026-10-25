// Builds the hub into dist/.
//
//   node scripts/build.mjs                → a working build; placeholders are warnings
//   node scripts/build.mjs --production   → what GitHub runs; placeholders are errors
//   node scripts/build.mjs --check        → only check config.yml, build nothing
//   --config <file> --out <dir>           → use another config / output folder (the tests do)

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { build as esbuild, transform } from 'esbuild';
import QRCode from 'qrcode';
import { loadConfigFile, validateConfig } from './lib/config.mjs';
import {
  homePage, supportPage, toolPage, thanksPage, demoPage, notFoundPage,
} from '../src/pages/pages.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const WIDGET_BUDGET = 15 * 1024; // bytes, gzipped

const color = process.stdout.isTTY
  ? { red: (s) => `\x1b[31m${s}\x1b[0m`, yellow: (s) => `\x1b[33m${s}\x1b[0m`, green: (s) => `\x1b[32m${s}\x1b[0m` }
  : { red: (s) => s, yellow: (s) => s, green: (s) => s };

/** The slice of the config the widget needs, baked into widget.js. */
export function widgetConfig(cfg) {
  return {
    brand: {
      name: cfg.brand.name,
      pitch: cfg.brand.pitch,
      pays_for: cfg.brand.pays_for,
      tax_note: cfg.brand.tax_note,
    },
    thanks: cfg.thanks,
    tools: Object.fromEntries(cfg.tools.map((t) => [t.id, { name: t.name, thanks_text: t.thanks_text }])),
    methods: cfg.methods.map((m) => ({
      type: m.type,
      label: m.label,
      primary: m.primary,
      placeholder: m.placeholder,
      href: m.href,
      display: m.display,
      copy: m.copy,
      qr: Boolean(m.qr),
      ...(m.stripe ? { stripe: m.stripe } : {}),
    })),
  };
}

/** Bundles and minifies the widget with the config baked in. */
export async function buildWidget(cfg) {
  const minCss = {
    name: 'min-css',
    setup(b) {
      b.onLoad({ filter: /\.css$/ }, async (args) => ({
        contents: (await transform(fs.readFileSync(args.path, 'utf8'), { loader: 'css', minify: true })).code,
        loader: 'text',
      }));
    },
  };
  const result = await esbuild({
    entryPoints: [path.join(ROOT, 'src/widget/widget.js')],
    bundle: true,
    minify: true,
    format: 'iife',
    target: ['es2018'],
    legalComments: 'none',
    write: false,
    plugins: [minCss],
    define: { __SUPPORT_CONFIG__: JSON.stringify(widgetConfig(cfg)) },
  });
  return result.outputFiles[0].text;
}

async function minify(file, loader) {
  return (await transform(fs.readFileSync(file, 'utf8'), { loader, minify: true })).code;
}

function write(dist, file, contents) {
  const target = path.join(dist, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

export async function build({
  production = false,
  checkOnly = false,
  configFile = path.join(ROOT, 'config.yml'),
  dist = path.join(ROOT, 'dist'),
  quiet = false,
} = {}) {
  const log = quiet ? () => {} : console.log;
  const loaded = loadConfigFile(configFile);
  const { errors, warnings, config: cfg } = loaded.errors
    ? { errors: loaded.errors, warnings: [], config: null }
    : validateConfig(loaded.raw, {
      production,
      screenshotsDir: path.join(ROOT, 'screenshots'),
      imagesDir: path.join(ROOT, 'images'),
    });

  for (const w of warnings) log(color.yellow(`  warning: ${w}`));
  if (errors.length) {
    console.error(color.red(`\n${path.basename(configFile)} has ${errors.length} problem${errors.length > 1 ? 's' : ''} to fix:`));
    for (const e of errors) console.error(color.red(`  • ${e}`));
    if (production) console.error('\n(This is the production check: placeholders must be replaced or switched off.)');
    return { ok: false, errors, warnings };
  }
  if (checkOnly) {
    log(color.green(`${path.basename(configFile)} looks good.`));
    return { ok: true, errors, warnings };
  }

  fs.rmSync(dist, { recursive: true, force: true });
  fs.mkdirSync(dist, { recursive: true });

  // QR codes, made here so visitors' browsers never need a QR library.
  const qr = {};
  for (const m of cfg.methods.filter((x) => x.qr)) {
    const svg = await QRCode.toString(m.qr, {
      type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' },
    });
    const labelled = svg.replace('<svg ', `<svg role="img" aria-label="QR code for ${m.label}" `);
    write(dist, `qr/${m.type}.svg`, labelled);
    qr[m.type] = labelled;
  }

  // The widget.
  const widget = await buildWidget(cfg);
  write(dist, 'widget.js', widget);
  const gz = zlib.gzipSync(widget, { level: 9 }).length;

  // Pages.
  const pages = [
    homePage(cfg),
    supportPage(cfg, qr),
    ...cfg.tools.filter((t) => t.page).map((t) => toolPage(cfg, t, qr)),
    thanksPage(cfg),
    demoPage(cfg),
    notFoundPage(cfg),
  ];
  for (const p of pages) write(dist, p.file, p.html);

  // Static files.
  write(dist, 'styles.css', await minify(path.join(ROOT, 'src/site/styles.css'), 'css'));
  write(dist, 'hub.js', await minify(path.join(ROOT, 'src/site/hub.js'), 'js'));
  write(dist, 'favicon.svg', fs.readFileSync(path.join(ROOT, 'src/site/favicon.svg')));
  write(dist, 'robots.txt', 'User-agent: *\nDisallow: /demo/\nDisallow: /thanks/\n');
  write(dist, 'fonts/nunito-sans.woff2', fs.readFileSync(path.join(ROOT,
    'node_modules/@fontsource-variable/nunito-sans/files/nunito-sans-latin-wght-normal.woff2')));
  for (const file of [cfg.brand.portrait, cfg.brand.footer_photo].filter(Boolean)) {
    write(dist, `images/${file}`, fs.readFileSync(path.join(ROOT, 'images', file)));
  }
  for (const t of cfg.tools.filter((x) => x.screenshot)) {
    write(dist, `screenshots/${t.screenshot}`, fs.readFileSync(path.join(ROOT, 'screenshots', t.screenshot)));
  }

  log(`Built ${pages.length} pages into ${path.relative(ROOT, dist) || '.'}/` + (production ? ' (production)' : ''));
  const sizeLine = `widget.js: ${(widget.length / 1024).toFixed(1)} KB, ${(gz / 1024).toFixed(1)} KB gzipped ` +
    `(budget ${WIDGET_BUDGET / 1024} KB)`;
  if (gz > WIDGET_BUDGET) {
    console.error(color.red(`${sizeLine}: over budget.`));
    return { ok: false, errors: ['widget.js is over its size budget.'], warnings };
  }
  log(sizeLine);
  return { ok: true, errors, warnings, widgetGzip: gz };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (name) => (args.includes(name) ? path.resolve(args[args.indexOf(name) + 1]) : undefined);
  const result = await build({
    production: args.includes('--production'),
    checkOnly: args.includes('--check'),
    ...(opt('--config') ? { configFile: opt('--config') } : {}),
    ...(opt('--out') ? { dist: opt('--out') } : {}),
  });
  process.exitCode = result.ok ? 0 : 1;
}
