// Loads config.yml, checks it, and turns it into the tidy shape the pages and
// the widget use. Every problem comes back as a plain-English message that
// says where it is and how to fix it.

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

export const PLACEHOLDER = /<<[^<>]*>>/;

// Every kind of support method, and the one field each one needs.
export const METHOD_TYPES = {
  stripe: { needs: null },
  kofi: { needs: 'url' },
  patreon: { needs: 'url' },
  paypal: { needs: 'url' },
  github: { needs: 'url' },
  venmo: { needs: 'handle' },
  cashapp: { needs: 'handle' },
  bitcoin: { needs: 'address' },
  lightning: { needs: 'address' },
};

const NEEDS_HELP = {
  url: 'the full link, starting with https://',
  handle: 'your username, without the @ or $',
  address: 'the address people send to',
};

const TOP_LEVEL = ['site', 'brand', 'thanks', 'tools', 'methods'];

// Icons the header and footer know how to draw.
export const SOCIAL_TYPES = {
  facebook: 'Facebook',
  twitter: 'Twitter',
  linkedin: 'LinkedIn',
  github: 'GitHub',
  youtube: 'YouTube',
  patreon: 'Patreon',
};
const TOOL_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function loadConfigFile(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return { errors: [`Can't find ${path.basename(file)}. It should sit in the project's top folder.`] };
  }
  const doc = YAML.parseDocument(text, { prettyErrors: true });
  if (doc.errors.length) {
    return {
      errors: doc.errors.map(
        (e) => `${path.basename(file)} isn't valid YAML: ${e.message.split('\n')[0]}. ` +
          'Check the indentation and quotes near that line.',
      ),
    };
  }
  return { raw: doc.toJS() ?? {} };
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());

function isHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Check a parsed config.
 * @param {object} raw - the parsed YAML
 * @param {{production?: boolean, screenshotsDir?: string}} [opts]
 * @returns {{errors: string[], warnings: string[], config: object|null}}
 */
export function validateConfig(raw, opts = {}) {
  const production = Boolean(opts.production);
  const errors = [];
  const warnings = [];
  // A placeholder is a warning while you work, and an error when publishing.
  const placeholder = (where, value) => {
    const msg = `${where} still has the placeholder ${value.match(PLACEHOLDER)[0]}. ` +
      'Replace it with the real value' + (where.startsWith('methods') ? ', or set enabled: false.' : '.');
    (production ? errors : warnings).push(msg);
  };
  const checkText = (where, value) => {
    if (typeof value === 'string' && PLACEHOLDER.test(value)) placeholder(where, value);
  };

  if (!isObj(raw)) {
    return { errors: ['config.yml is empty or not laid out as sections (site:, brand:, tools:, methods:).'], warnings, config: null };
  }
  for (const key of Object.keys(raw)) {
    if (!TOP_LEVEL.includes(key)) {
      warnings.push(`config.yml has a section called "${key}" that nothing uses. Is it a typo of one of: ${TOP_LEVEL.join(', ')}?`);
    }
  }

  // ── site ──
  const site = isObj(raw.site) ? raw.site : {};
  let siteUrl = str(site.url).replace(/\/+$/, '');
  if (!siteUrl) errors.push('site → url is missing. It should be the hub\'s address, like https://tools.example.com');
  else if (PLACEHOLDER.test(siteUrl)) checkText('site → url', siteUrl);
  else if (!isHttpUrl(siteUrl)) errors.push(`site → url "${siteUrl}" isn't a web address. It should look like https://tools.example.com`);
  else if (production && !siteUrl.startsWith('https://')) errors.push('site → url must start with https:// for the live site.');

  // ── brand ──
  const brand = isObj(raw.brand) ? raw.brand : {};
  if (!str(brand.name)) errors.push('brand → name is missing. It\'s the name shown at the top of every page.');
  for (const k of ['name', 'intro', 'pitch', 'tax_note', 'about_url']) checkText(`brand → ${k}`, brand[k]);
  if (brand.about_url && !PLACEHOLDER.test(str(brand.about_url)) && !isHttpUrl(str(brand.about_url))) {
    errors.push(`brand → about_url "${brand.about_url}" isn't a web address.`);
  }
  const blogUrl = str(brand.blog_url);
  if (blogUrl && !PLACEHOLDER.test(blogUrl) && !isHttpUrl(blogUrl)) errors.push(`brand → blog_url "${blogUrl}" isn't a web address.`);
  checkText('brand → footer_about', brand.footer_about);
  const photo = (key) => {
    const file = str(brand[key]);
    if (file && opts.imagesDir && !fs.existsSync(path.join(opts.imagesDir, file))) {
      errors.push(`brand → ${key}: "${file}" isn't in the images folder. Check the file name, or remove the line.`);
    }
    return file || null;
  };
  const portrait = photo('portrait');
  const footerPhoto = photo('footer_photo');
  const social = [];
  if (brand.social != null && !Array.isArray(brand.social)) {
    errors.push('brand → social should be a list, each with a type and a url.');
  } else {
    (brand.social || []).forEach((item, i) => {
      const type = str(item?.type).toLowerCase();
      const url = str(item?.url);
      const where = `brand → social → ${type || `number ${i + 1}`}`;
      if (!SOCIAL_TYPES[type]) {
        errors.push(`${where}: "${type}" isn't an icon this hub has. Use one of: ${Object.keys(SOCIAL_TYPES).join(', ')}.`);
      } else if (!url || !isHttpUrl(url)) {
        errors.push(`${where} needs a url, starting with https://`);
      } else {
        social.push({ type, url, label: SOCIAL_TYPES[type] });
      }
    });
  }
  const aka = Array.isArray(brand.also_known_as) ? brand.also_known_as.map(str).filter(Boolean)
    : str(brand.also_known_as) ? [str(brand.also_known_as)] : [];
  const paysFor = Array.isArray(brand.pays_for) ? brand.pays_for.map(str).filter(Boolean) : [];

  // ── thanks ──
  const t = isObj(raw.thanks) ? raw.thanks : {};
  const thanks = {
    enabled: t.enabled !== false,
    interval_days: t.interval_days ?? 30,
    fade_seconds: t.fade_seconds ?? 12,
    message: str(t.message) || 'Glad it worked! If this tool helped, you can leave a tip.',
  };
  if (!(Number.isFinite(thanks.interval_days) && thanks.interval_days >= 0)) {
    errors.push(`thanks → interval_days should be a number of days: 0 for every time, or more (it's "${t.interval_days}").`);
  }
  if (!(Number.isFinite(thanks.fade_seconds) && thanks.fade_seconds >= 3 && thanks.fade_seconds <= 60)) {
    errors.push(`thanks → fade_seconds should be between 3 and 60 (it's "${t.fade_seconds}").`);
  }
  checkText('thanks → message', thanks.message);

  // ── tools ──
  const tools = [];
  if (!Array.isArray(raw.tools) || raw.tools.length === 0) {
    warnings.push('tools is empty, so the home page has no tools to show yet.');
  } else {
    const seen = new Set();
    raw.tools.forEach((tool, i) => {
      const id = str(tool?.id);
      const label = id ? `tools → "${id}"` : `tools → number ${i + 1}`;
      if (!isObj(tool)) {
        errors.push(`${label} isn't laid out as a tool (id:, name:, url:, ...).`);
        return;
      }
      if (!id) errors.push(`${label} needs an id: a short permanent name like my-tool.`);
      else if (!TOOL_ID.test(id)) {
        errors.push(`${label}: the id can only use lowercase letters, numbers and dashes, and must start with a letter or number.`);
      } else if (seen.has(id)) errors.push(`${label}: two tools share this id. Each id must be different.`);
      seen.add(id);
      const name = str(tool.name);
      if (!name) errors.push(`${label} needs a name.`);
      const url = str(tool.url);
      if (!url) errors.push(`${label} has no url: the link people click to open or download the tool.`);
      else if (PLACEHOLDER.test(url)) checkText(`${label} → url`, url);
      else if (!isHttpUrl(url)) errors.push(`${label} → url "${url}" isn't a web address. It should start with https://`);
      const description = str(tool.description);
      if (!description) warnings.push(`${label} has no description, so its card will only show the name.`);
      for (const k of ['name', 'description', 'thanks_text']) checkText(`${label} → ${k}`, tool[k]);
      const screenshot = str(tool.screenshot);
      if (screenshot && opts.screenshotsDir && !fs.existsSync(path.join(opts.screenshotsDir, screenshot))) {
        errors.push(`${label}: the screenshot "${screenshot}" isn't in the screenshots folder. Check the file name, or remove the line.`);
      }
      tools.push({
        id, name, description, url,
        screenshot: screenshot || null,
        page: tool.page === true,
        thanks_text: str(tool.thanks_text) || null,
      });
    });
  }

  // ── methods ──
  const methods = [];
  if (!Array.isArray(raw.methods)) {
    errors.push('methods is missing. It lists the ways people can support you.');
  } else {
    const seenTypes = new Set();
    raw.methods.forEach((m, i) => {
      const type = str(m?.type).toLowerCase();
      const label = `methods → ${type || `number ${i + 1}`}`;
      if (!isObj(m) || !type) {
        errors.push(`${label} needs a type (one of: ${Object.keys(METHOD_TYPES).join(', ')}).`);
        return;
      }
      if (!METHOD_TYPES[type]) {
        errors.push(`${label}: "${type}" isn't a type this hub knows. Use one of: ${Object.keys(METHOD_TYPES).join(', ')}.`);
        return;
      }
      if (seenTypes.has(type)) {
        errors.push(`${label} appears twice. List each type once.`);
        return;
      }
      seenTypes.add(type);
      if (m.enabled === false) return; // switched off: ignore it entirely, placeholders and all
      const method = normalizeMethod(type, m, label, { errors, checkText, imagesDir: opts.imagesDir });
      if (method) methods.push(method);
    });
    const primary = methods.filter((m) => m.primary).length;
    if (methods.length && primary === 0) {
      warnings.push('No method has primary: true, so the support panel opens straight to "More ways to support".');
    }
    if (primary > 3) {
      warnings.push(`${primary} methods are primary. Two or three keeps the panel easy; set primary: false on the rest.`);
    }
    if (methods.length === 0) warnings.push('Every support method is switched off, so the panel has nothing to show.');
  }

  return {
    errors,
    warnings,
    config: errors.length ? null : {
      site: {
        url: siteUrl,
        name: str(site.name) || (isHttpUrl(siteUrl) ? new URL(siteUrl).host : str(brand.name)),
        title: str(site.title) || str(brand.name),
        analytics_snippet: str(site.analytics_snippet),
      },
      brand: {
        name: str(brand.name),
        also_known_as: aka,
        intro: str(brand.intro),
        about_url: str(brand.about_url) || null,
        blog_url: blogUrl || null,
        portrait,
        footer_photo: footerPhoto,
        footer_about: str(brand.footer_about),
        social,
        pitch: str(brand.pitch),
        pays_for: paysFor,
        tax_note: str(brand.tax_note),
      },
      thanks,
      tools,
      methods,
    },
  };
}

function normalizeMethod(type, m, label, { errors, checkText, imagesDir }) {
  const method = {
    type,
    label: str(m.label) || type,
    primary: m.primary === true,
    placeholder: false,
    href: null,
    display: null,
    copy: null,
    qr: null,
    qr_image: null, // your own QR picture from images/, used instead of a generated one
    qr_path: null, // where the QR ends up on the hub, e.g. qr/venmo.svg
  };
  const markPlaceholder = (where, value) => {
    if (typeof value === 'string' && PLACEHOLDER.test(value)) {
      method.placeholder = true;
      checkText(where, value);
      return true;
    }
    return false;
  };

  if (type === 'stripe') {
    const list = (key) => {
      if (m[key] == null) return [];
      if (!Array.isArray(m[key])) {
        errors.push(`${label} → ${key} should be a list of amounts, each with an amount and a url.`);
        return [];
      }
      return m[key].map((row, i) => {
        const amount = Number(row?.amount);
        const url = str(row?.url);
        const where = `${label} → ${key} → ${row?.amount ?? `number ${i + 1}`}`;
        if (!(amount > 0)) errors.push(`${where}: amount should be a number above 0, like 5.`);
        if (!url) errors.push(`${where} needs a url: the Stripe Payment Link for that amount.`);
        else if (!markPlaceholder(`${where} → url`, url) && !isHttpUrl(url)) {
          errors.push(`${where} → url "${url}" isn't a web address. Paste the whole Stripe link.`);
        }
        return { amount, url };
      });
    };
    const oneTime = list('one_time');
    const monthly = list('monthly');
    const custom = str(m.choose_your_own_url);
    if (custom && !markPlaceholder(`${label} → choose_your_own_url`, custom) && !isHttpUrl(custom)) {
      errors.push(`${label} → choose_your_own_url "${custom}" isn't a web address.`);
    }
    if (!oneTime.length && !monthly.length && !custom) {
      errors.push(`${label} has no links. Add one_time, monthly or choose_your_own_url, or set enabled: false.`);
    }
    method.stripe = { one_time: oneTime, monthly, choose_your_own_url: custom || null };
    method.href = custom || oneTime[0]?.url || monthly[0]?.url || null;
    return method;
  }

  const field = METHOD_TYPES[type].needs;
  const value = str(m[field]).replace(type === 'venmo' ? /^@/ : type === 'cashapp' ? /^\$/ : /^$/, '');
  if (!value) {
    errors.push(`${label} needs ${field}: ${NEEDS_HELP[field]}. Or set enabled: false.`);
    return null;
  }
  const isPlaceholder = markPlaceholder(`${label} → ${field}`, value);

  switch (type) {
    case 'kofi':
    case 'patreon':
    case 'paypal':
    case 'github':
      if (!isPlaceholder && !isHttpUrl(value)) errors.push(`${label} → url "${value}" isn't a web address. It should start with https://`);
      method.href = value;
      if (type === 'paypal') method.qr = value; // PayPal.Me links scan well from a phone
      break;
    case 'venmo':
      method.href = `https://venmo.com/u/${encodeURIComponent(value)}`;
      method.display = `@${value}`;
      method.qr = method.href;
      break;
    case 'cashapp':
      method.href = `https://cash.app/$${encodeURIComponent(value)}`;
      method.display = `$${value}`;
      method.qr = method.href;
      break;
    case 'bitcoin':
      if (!isPlaceholder && !/^(bc1[ac-hj-np-z02-9]{11,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/i.test(value)) {
        errors.push(`${label} → address "${value}" doesn't look like a Bitcoin address (they start with bc1, 1 or 3).`);
      }
      method.href = `bitcoin:${value}`;
      method.display = value;
      method.copy = value;
      method.qr = `bitcoin:${value}`;
      break;
    case 'lightning':
      if (!isPlaceholder && !/^[a-z0-9._+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(value)) {
        errors.push(`${label} → address "${value}" doesn't look like a Lightning address (it looks like an email: name@provider.com).`);
      }
      method.href = `lightning:${value}`;
      method.display = value;
      method.copy = value;
      method.qr = `lightning:${value}`;
      break;
  }

  const qrImage = str(m.qr_image);
  if (qrImage) {
    if (imagesDir && !fs.existsSync(path.join(imagesDir, qrImage))) {
      errors.push(`${label} → qr_image: "${qrImage}" isn't in the images folder. Check the file name, or remove the line.`);
    }
    method.qr_image = qrImage;
  }
  if (method.qr_image) method.qr_path = `qr/${type}${path.extname(method.qr_image).toLowerCase()}`;
  else if (method.qr) method.qr_path = `qr/${type}.svg`;
  return method;
}

/** Appends ?client_reference_id=<tool> to a Stripe link so the payment records which tool it came from. */
export function tagStripeUrl(url, toolId) {
  if (!toolId || !url || PLACEHOLDER.test(url)) return url;
  try {
    const u = new URL(url);
    u.searchParams.set('client_reference_id', toolId);
    return u.toString();
  } catch {
    return url;
  }
}
