// extract-branding.mjs — derive a visual skin from a customer site into branding.json.
// Playwright screenshot + node-vibrant palette, computed fonts, logo URL, brand copy.
// Downloads nothing (a screenshot is written next to --out for provenance).
// Interface pinned in tools/onboarding/CONTRACT.md.
import { dirname, join } from 'node:path';
import Vibrant from 'node-vibrant';
import { chromium } from 'playwright';
import { parseArgs, requireArg, writeJson, ensureDir, toHex, darken, log } from './lib/util.mjs';

async function main() {
  const args = parseArgs();
  const url = requireArg(args, 'url');
  const outPath = requireArg(args, 'out');
  const host = new URL(url).host.replace(/[^a-z0-9.-]/gi, '_');
  const shotDir = dirname(outPath);
  const shotPath = join(shotDir, `${host}-home.png`);
  await ensureDir(shotDir);

  const browser = await chromium.launch();
  let dom, shot;
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => page.goto(url, { waitUntil: 'load', timeout: 45000 }));
    shot = await page.screenshot({ path: shotPath, fullPage: false });
    dom = await page.evaluate(readDom);
  } finally {
    await browser.close();
  }

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
    provenance: { screenshots: [`${host}-home.png`], swatchSource: 'node-vibrant' },
  });
  log.ok(`Wrote ${outPath} (screenshot: ${shotPath}).`);
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

async function paletteFrom(buffer) {
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
