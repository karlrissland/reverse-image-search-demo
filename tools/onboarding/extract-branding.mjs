// extract-branding.mjs — derive a visual skin from a customer site into branding.json.
// Playwright screenshot + node-vibrant palette, computed fonts, logo URL, brand copy.
// Downloads nothing (a screenshot is written next to --out for provenance).
// Interface pinned in tools/onboarding/CONTRACT.md.
import { dirname, join } from 'node:path';
import Vibrant from 'node-vibrant';
import { parseArgs, requireArg, writeJson, ensureDir, toHex, darken, log } from './lib/util.mjs';
import { launchBrowser, newPage } from './lib/browser.mjs';

// Drive a REAL browser channel (Edge/Chrome) headed by default — bundled headless Chromium
// presents an obvious fingerprint that retail bot walls stall on (the homepage `commit` timeout
// we hit). Headed + real channel loads the very same sites, and lets a human clear any challenge.
const NAV_TIMEOUT = 45000;
const SHOT_TIMEOUT = 15000; // cap on the screenshot
const SETTLE_MS = 1500; // let late hero CSS/images paint

async function main() {
  const args = parseArgs();
  const url = requireArg(args, 'url');
  const outPath = requireArg(args, 'out');
  const host = new URL(url).host.replace(/[^a-z0-9.-]/gi, '_');
  const shotDir = dirname(outPath);
  const shotPath = join(shotDir, `${host}-home.png`);
  await ensureDir(shotDir);

  let dom = {}, shot = null, navLinks = [];
  const browser = await launchBrowser(args);
  try {
    const page = await newPage(browser);
    log.info(`Navigating to ${url} … (solve any bot challenge in the window if it appears)`);
    // Heavy retail homepages may never fire `load`; settle on a parsed DOM instead and proceed
    // with whatever rendered rather than aborting.
    try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }); }
    catch (e) { log.warn(`Navigation didn't fully settle (${String(e.message).split('\n')[0]}); proceeding with whatever loaded.`); }
    await page.waitForTimeout(SETTLE_MS); // let late hero CSS/images paint

    log.info('Reading computed styles, fonts, logo, and copy…');
    try { dom = await page.evaluate(readDom); }
    catch (e) { log.warn(`Style/DOM read failed (${e.message}); using defaults.`); }

    log.info('Harvesting navigation / category links…');
    try { navLinks = await page.evaluate(collectNav); }
    catch (e) { log.warn(`Nav harvest failed (${e.message}); navLinks will be empty.`); }

    // `animations: 'disabled'` stops infinite CSS/Web animations that keep a retail homepage
    // from ever stabilizing for capture (a common screenshot-timeout cause).
    log.info('Capturing screenshot for palette…');
    try { shot = await page.screenshot({ path: shotPath, fullPage: false, animations: 'disabled', timeout: SHOT_TIMEOUT }); }
    catch (e) { log.warn(`Screenshot failed (${e.message}); palette will use neutral defaults.`); }
  } finally {
    await browser.close();
  }

  log.info('Extracting palette and assembling branding.json…');

  const swatches = await paletteFrom(shot);
  const palette = buildPalette(swatches, dom);
  const brand = buildBrand(url, dom);
  const fonts = { heading: dom.headingFont || 'Inter, sans-serif', body: dom.bodyFont || 'Inter, sans-serif' };

  await writeJson(outPath, {
    site: new URL(url).origin,
    generatedAt: new Date().toISOString(),
    brand,
    palette,
    fonts,
    navLinks,
    provenance: { screenshots: [`${host}-home.png`], swatchSource: 'node-vibrant' },
  });
  log.ok(`Wrote ${outPath} (screenshot: ${shotPath}).`);
  if (navLinks.length) {
    log.info(`Found ${navLinks.length} candidate nav/category link(s) → branding.json "navLinks".`);
    log.info('Curate these into product-category URLs, then: scrape-catalog.mjs --category-urls "<u1>,<u2>".');
  }
  log.info('Review palette/fonts/logo/copy, then apply-branding.mjs. Keep the "not affiliated" footer.');
}

function readDom() {
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const body = document.body;
  const heading = document.querySelector('h1, h2, header a, .logo');
  const abs = (u) => { try { return u ? new URL(u, location.href).href : null; } catch { return null; } };
  const pick = (sel, attr) => { const el = document.querySelector(sel); return el ? (attr ? el.getAttribute(attr) : (el.textContent || '').trim()) : null; };

  let logo = pick('meta[property="og:logo"]', 'content');
  if (!logo) {
    const cand = document.querySelector('header img[src], [class*="logo" i] img[src], img[alt*="logo" i]');
    if (cand) logo = cand.currentSrc || cand.getAttribute('src');
  }
  if (!logo) logo = pick('link[rel~="icon"]', 'href') || pick('link[rel="shortcut icon"]', 'href');

  return {
    bg: cs(body)?.backgroundColor || null,
    ink: cs(body)?.color || null,
    headingFont: cs(heading)?.fontFamily || null,
    bodyFont: cs(body)?.fontFamily || null,
    siteName: pick('meta[property="og:site_name"]', 'content'),
    title: document.title,
    description: pick('meta[name="description"]', 'content'),
    logoUrl: abs(logo),
  };
}

// Labeled, same-origin links inside the site's primary navigation — advisory candidate category
// URLs for the AI to curate and feed to scrape-catalog.mjs --category-urls. Not part of the skin.
function collectNav() {
  const origin = location.origin;
  const SKIP = /account|login|sign[\s-]?in|register|cart|bag|checkout|wishlist|store[\s-]?locator|find[\s-]?a[\s-]?store|gift[\s-]?card|help|support|contact|track|order|careers|blog|privacy|terms|policy|faq|shipping|returns|klarna|afterpay/i;
  const scopes = [...document.querySelectorAll('header, nav, [role="navigation"], [class*="nav" i], [class*="menu" i]')];
  const out = new Map();
  for (const scope of scopes) {
    for (const a of scope.querySelectorAll('a[href]')) {
      let u;
      try { u = new URL(a.getAttribute('href'), location.href); } catch { continue; }
      if (u.origin !== origin) continue;
      if (u.pathname === '/' || u.pathname === '') continue;
      const label = (a.textContent || '').replace(/\s+/g, ' ').trim();
      if (!label || label.length > 40) continue;
      if (SKIP.test(label) || SKIP.test(u.pathname)) continue;
      u.hash = '';
      const key = u.href;
      if (!out.has(key)) out.set(key, { label, url: key });
    }
  }
  return [...out.values()].slice(0, 40);
}

async function paletteFrom(buffer) {
  if (!Buffer.isBuffer(buffer)) return {}; // no screenshot → neutral defaults (skip node-vibrant)
  try {
    const p = await Vibrant.from(buffer).getPalette();
    const hex = (s) => (s ? s.getHex() : null);
    return {
      vibrant: hex(p.Vibrant),
      darkVibrant: hex(p.DarkVibrant),
      lightVibrant: hex(p.LightVibrant),
      muted: hex(p.Muted),
      darkMuted: hex(p.DarkMuted),
      lightMuted: hex(p.LightMuted),
    };
  } catch (err) {
    log.warn(`Palette extraction failed (${err.message}); using neutral defaults.`);
    return {};
  }
}

function buildPalette(sw, dom) {
  const bg = toHex(dom.bg) || '#ffffff';
  const ink = toHex(dom.ink) || '#1a1a1a';
  const primary = sw.vibrant || sw.darkVibrant || '#1f3a5f';
  const secondary = sw.lightVibrant || sw.muted || sw.darkMuted || darken(primary, -0.0) || '#7c9cff';
  return {
    primary,
    primaryHover: sw.darkVibrant || darken(primary, 0.2),
    secondary,
    background: bg,
    surface: darken(bg, 0.04),
    ink,
    muted: sw.muted || darken(ink, -0.35) || '#6b7280',
    line: darken(bg, 0.12),
    danger: '#e5484d',
  };
}

function buildBrand(url, dom) {
  const host = new URL(url).host.replace(/^www\./, '');
  const name = (dom.siteName || dom.title?.split(/[|\-–—]/)[0] || host).trim();
  const tagline = shorten(dom.description, 60) || 'Visual search demo';
  return {
    name,
    tagline,
    heroTitle: 'Find the look from any image.',
    heroSubtitle: `Upload a photo and discover visually similar items from ${name}.`,
    footerNote: `Visual search demo. Not affiliated with ${name}.`,
    pageTitle: 'Vision Search',
    logoUrl: dom.logoUrl || null,
    fontUrl: null,
  };
}

function shorten(s, n) {
  if (!s) return null;
  const t = s.trim();
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + '…';
}

main().catch((err) => { log.err(err.stack || err.message); process.exit(1); });
