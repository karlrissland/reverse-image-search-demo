// scrape-catalog.mjs — discover product pages on a customer site and emit catalog.json.
// Downloads nothing. Raw Playwright (real Edge/Chrome channel, headed by default so a human can
// clear bot challenges), robots-aware. Prefer --category-urls (or a --map of category listings)
// because product-URL structure varies wildly per site; homepage discovery is the fallback.
// Interface pinned in tools/onboarding/CONTRACT.md.
import { parseArgs, requireArg, readJson, writeJson, log } from './lib/util.mjs';
import { loadRobots } from './lib/robots.mjs';
import { launchBrowser, newPage } from './lib/browser.mjs';

const NAV_TIMEOUT = 30000; // cap on the initial navigation (commit)
const DOM_TIMEOUT = 8000; // additional bounded wait for DOMContentLoaded after commit
const SETTLE_MS = 800; // let late content (JSON-LD, og tags, hero img) paint before extracting

async function main() {
  const args = parseArgs();
  const outPath = requireArg(args, 'out');
  const max = Number(args.max ?? 40);
  const categoryHints = String(args.categories ?? '').split(',').map((c) => c.trim()).filter(Boolean);

  // Resolve the mode + entries first so --url is optional when category/product URLs are supplied.
  const categoryEntries = await resolveCategoryEntries(args);
  const productEntries = categoryEntries.length ? [] : await resolveProductEntries(args);
  const startUrl = (args.url && args.url !== true) ? String(args.url)
    : categoryEntries[0]?.url || productEntries[0]?.url;
  if (!startUrl) {
    throw new Error('Provide --url <site>, or --category-urls "u1,u2", or --map <file>. See tools/onboarding/CONTRACT.md.');
  }
  const origin = new URL(startUrl).origin;

  const robots = await loadRobots(origin);
  const items = [];
  const seen = new Set();

  const push = (rec) => {
    if (!rec || !rec.imageUrl || seen.has(rec.sourceUrl || rec.imageUrl)) return;
    seen.add(rec.sourceUrl || rec.imageUrl);
    items.push(rec);
  };

  const ctx = { origin, robots, categoryHints, push, max, count: () => items.length };

  const browser = await launchBrowser(args);
  try {
    const page = await newPage(browser);
    if (categoryEntries.length) {
      // Preferred: caller supplies category listing URLs; we expand each into its product pages.
      await crawlCategories(page, categoryEntries, ctx);
    } else if (productEntries.length) {
      // Caller supplies known product-page URLs directly.
      await crawlUrls(page, productEntries, ctx);
    } else {
      // Fallback: bounded same-origin crawl from the homepage.
      await discover(page, startUrl, ctx);
    }
  } finally {
    await browser.close();
  }

  const categories = [...new Set(items.map((i) => i.category))].sort();
  await writeJson(outPath, {
    site: origin,
    generatedAt: new Date().toISOString(),
    categories,
    items,
  });
  log.ok(`Wrote ${items.length} item(s) across ${categories.length} categor(y|ies) to ${outPath}.`);
  log.info('Review catalog.json (categories, public split, metadata) BEFORE running download-catalog.mjs.');
}

/** Category listing URLs to expand: from --category-urls "u1,u2" or a --map `{ categories: [...] }`.
 * Entries may be a bare URL string or `{ url, name|category }`. */
async function resolveCategoryEntries(args) {
  if (args['category-urls'] && args['category-urls'] !== true) {
    return String(args['category-urls']).split(',').map((s) => s.trim()).filter(Boolean).map((url) => ({ url }));
  }
  if (args.map && args.map !== true) {
    const map = await readJson(String(args.map));
    if (Array.isArray(map.categories)) {
      return map.categories
        .map((m) => (typeof m === 'string' ? { url: m } : m))
        .filter((m) => m && m.url);
    }
  }
  return [];
}

/** Direct product-page URLs: from a --map array / `{ pages: [...] }` (legacy shape). */
async function resolveProductEntries(args) {
  if (args.map && args.map !== true) {
    const map = await readJson(String(args.map));
    return normalizeMap(map);
  }
  return [];
}

function normalizeMap(map) {
  if (Array.isArray(map)) return map.map((m) => (typeof m === 'string' ? { url: m } : m));
  if (Array.isArray(map.pages)) return map.pages.map((m) => (typeof m === 'string' ? { url: m } : m));
  return [];
}

/** For each category listing: load it, collect product-tile links, and extract each product page.
 * `--max` is applied PER category so the budget is shared fairly across categories. */
/** For each category listing: load it, scroll to trigger lazy images, then harvest product data
 * straight from the listing tiles (URL + image + title). We deliberately do NOT open each product
 * page — many retail sites bot-block deep product navigation, and the listing tile already carries
 * everything a demo corpus needs. `--max` is applied PER category. */
async function crawlCategories(page, entries, ctx) {
  const { robots, push, max, origin } = ctx;
  for (const entry of entries) {
    if (!robots.isAllowed(new URL(entry.url).pathname)) { log.warn(`robots.txt disallows ${entry.url} — skipping.`); continue; }
    if (!(await goto(page, entry.url))) continue;
    const category = (entry.category || entry.name || await categoryNameFromPage(page, entry.url)).trim() || 'Products';
    await autoScroll(page); // trigger lazy-loaded product images
    const tiles = await extractTiles(page, origin);
    log.info(`Category "${category}": ${tiles.length} product tile(s) on ${entry.url}`);

    let taken = 0;
    for (const t of tiles) {
      if (taken >= max) break;
      if (!t.imageUrl) continue;
      push(buildTileRecord(t, category));
      taken++;
    }
    log.ok(`Category "${category}": captured ${taken} product(s).`);
  }
}

/** Assemble a catalog record from a listing tile. */
function buildTileRecord(t, category) {
  return {
    sourceUrl: t.url,
    imageUrl: t.imageUrl,
    category: String(category).trim() || 'Products',
    title: t.title || '',
    public: true,
    descriptive: {
      subcategory: undefined,
      color: undefined,
      season: undefined,
      caption: (t.title || '').trim() || undefined,
      tags: [],
    },
    attributes: cleanAttrs({ price: t.price }),
  };
}

/** Harvest product tiles from a listing page: same-origin anchors that wrap an <img>, live OUTSIDE
 * the header/footer/nav chrome, and do NOT share the listing's first path segment (so sibling
 * category/subcategory tiles are dropped). Returns { url, imageUrl, title, price } per tile,
 * resolving the real image behind lazy-load placeholders via srcset / data-src. */
async function extractTiles(page, origin) {
  const tiles = await page.evaluate((org) => {
    const inChrome = (el) => el.closest('header, footer, nav, [role="navigation"]') !== null;
    const listingSeg = (location.pathname.split('/').filter(Boolean)[0] || '').toLowerCase();
    const abs = (u) => { try { return u ? new URL(u, location.href).href : null; } catch { return null; } };
    const isPlaceholder = (s) => !s || /^data:|placeholder|blank|spacer|lazy|1x1|pixel|transparent/i.test(s);
    const bestImg = (img) => {
      const ss = img.getAttribute('srcset') || img.getAttribute('data-srcset');
      if (ss) {
        const last = ss.split(',').map((x) => x.trim().split(/\s+/)[0]).filter(Boolean).pop();
        if (last && !isPlaceholder(last)) return last;
      }
      for (const c of [img.currentSrc, img.getAttribute('data-src'), img.getAttribute('data-original'), img.getAttribute('src')]) {
        if (c && !isPlaceholder(c)) return c;
      }
      return null;
    };
    const seen = new Set();
    const out = [];
    for (const a of document.querySelectorAll('a[href]')) {
      if (inChrome(a)) continue;
      const img = a.querySelector('img');
      if (!img) continue;
      let u; try { u = new URL(a.getAttribute('href'), location.href); } catch { continue; }
      if (u.origin !== org || u.pathname === '/' || u.pathname === '') continue;
      const seg = (u.pathname.split('/').filter(Boolean)[0] || '').toLowerCase();
      if (listingSeg && seg === listingSeg) continue; // sibling listing, not a product
      u.hash = '';
      if (seen.has(u.href)) continue;
      seen.add(u.href);
      const title = ((img.getAttribute('alt') || '').trim()
        || (a.getAttribute('title') || '').trim()
        || (a.textContent || '').replace(/\s+/g, ' ').trim()).slice(0, 140);
      out.push({ url: u.href, imageUrl: abs(bestImg(img)), title });
    }
    return out;
  }, origin);
  return tiles.filter((t) => t.imageUrl);
}

/** Scroll the page in steps to trigger lazy-loaded images, then return to top. Bounded. */
async function autoScroll(page) {
  try {
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let y = 0;
        const tick = () => {
          window.scrollBy(0, 900);
          y += 900;
          if (y >= document.body.scrollHeight - window.innerHeight || y > 18000) return resolve();
          setTimeout(tick, 150);
        };
        tick();
      });
    });
    await page.waitForTimeout(700);
    await page.evaluate(() => window.scrollTo(0, 0));
  } catch { /* non-fatal */ }
}

/** Derive a short category name from the listing page (h1 / og:title / title), trimmed of the
 * trailing " - Site" / " | Site" suffix. */
async function categoryNameFromPage(page, url) {
  const raw = await page.evaluate(() => {
    const t = (s) => { const e = document.querySelector(s); return e ? (e.textContent || '').trim() : ''; };
    const og = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
    return t('h1') || og.trim() || document.title || '';
  });
  const name = String(raw).split(/\s+[-|–]\s+/)[0].trim();
  return name || new URL(url).pathname.split('/').filter(Boolean).slice(-1)[0] || 'Products';
}

/** Best-effort navigation; returns false (and warns) instead of throwing so one dead link
 * never aborts the crawl. Uses `commit` (earliest signal) then a bounded DOM wait, because
 * ad/tracker-heavy retail pages often never fire `domcontentloaded` within a sane timeout. */
async function goto(page, url) {
  try {
    await page.goto(url, { waitUntil: 'commit', timeout: NAV_TIMEOUT });
    await page.waitForLoadState('domcontentloaded', { timeout: DOM_TIMEOUT }).catch(() => {});
    await page.waitForTimeout(SETTLE_MS);
    return true;
  } catch (err) {
    log.warn(`Skip ${url} (${String(err.message).split('\n')[0]}).`);
    return false;
  }
}

/** Discover products via a bounded, robots-aware, same-origin breadth-first crawl. */
async function discover(page, startUrl, ctx) {
  const { robots, push, max, origin } = ctx;
  const maxVisits = Math.max(20, max * 5);
  const queue = [startUrl];
  const queued = new Set([startUrl]);
  const visited = new Set();

  while (queue.length && ctx.count() < max && visited.size < maxVisits) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);
    if (!robots.isAllowed(new URL(url).pathname)) continue;
    if (!(await goto(page, url))) continue;

    const info = await extract(page, url, ctx);
    if (info.isProduct) push(info.record);
    if (ctx.count() >= max) break;

    for (const link of await sameOriginLinks(page, origin)) {
      if (queued.has(link) || visited.has(link)) continue;
      if (!robots.isAllowed(new URL(link).pathname)) continue;
      queued.add(link);
      queue.push(link);
    }
  }
}

/** Same-origin, hash-stripped links on the current page. */
async function sameOriginLinks(page, origin) {
  return page.evaluate((org) => {
    const out = new Set();
    for (const a of document.querySelectorAll('a[href]')) {
      try {
        const u = new URL(a.getAttribute('href'), location.href);
        if (u.origin === org) { u.hash = ''; out.add(u.href); }
      } catch { /* ignore malformed href */ }
    }
    return [...out];
  }, origin);
}

async function crawlUrls(page, urls, ctx) {
  const { robots, push, max } = ctx;
  for (const u of urls) {
    if (ctx.count() >= max) break;
    const path = new URL(u.url).pathname;
    if (!robots.isAllowed(path)) { log.warn(`robots.txt disallows ${path} — skipping.`); continue; }
    if (!(await goto(page, u.url))) continue;
    // For an explicit map we trust the URL is a product page even if heuristics are unsure.
    const info = await extract(page, u.url, { ...ctx, forcedCategory: u.category });
    push(info.record);
  }
}
/** Pull product signals from a page via JSON-LD, OpenGraph, and DOM heuristics. */
async function extract(page, url, ctx) {
  const raw = await page.evaluate(() => {
    const pick = (sel, attr) => { const el = document.querySelector(sel); return el ? (attr ? el.getAttribute(attr) : el.textContent) : null; };
    const ld = [];
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try { ld.push(JSON.parse(s.textContent)); } catch { /* ignore */ }
    }
    // Largest visible image as a fallback product shot.
    let best = null, bestArea = 0;
    for (const img of document.querySelectorAll('img')) {
      const a = (img.naturalWidth || 0) * (img.naturalHeight || 0);
      if (a > bestArea && img.currentSrc) { bestArea = a; best = img.currentSrc; }
    }
    const bc = [...document.querySelectorAll('nav[aria-label*="readcrumb" i] a, .breadcrumb a, [class*="readcrumb" i] a')]
      .map((a) => a.textContent.trim()).filter(Boolean);
    return {
      ogType: pick('meta[property="og:type"]', 'content'),
      ogTitle: pick('meta[property="og:title"]', 'content'),
      ogImage: pick('meta[property="og:image"]', 'content'),
      ogSite: pick('meta[property="og:site_name"]', 'content'),
      metaDesc: pick('meta[name="description"]', 'content'),
      keywords: pick('meta[name="keywords"]', 'content'),
      priceAmount: pick('meta[property="product:price:amount"]', 'content'),
      priceCurrency: pick('meta[property="product:price:currency"]', 'content'),
      h1: pick('h1'),
      title: document.title,
      largestImg: best,
      breadcrumb: bc,
      ld,
    };
  });

  const product = findProduct(raw.ld);
  const isProduct = Boolean(
    product || raw.ogType === 'product' || raw.priceAmount ||
    (ctx.forcedCategory !== undefined)
  );

  const imageUrl = abs(url, productImage(product) || raw.ogImage || raw.largestImg);
  const title = (product?.name || raw.ogTitle || raw.h1 || raw.title || '').trim();
  const category = ctx.forcedCategory
    || product?.category
    || raw.breadcrumb?.slice(-2, -1)?.[0]
    || matchHint(url, title, ctx.categoryHints)
    || 'Products';

  const record = {
    sourceUrl: url,
    imageUrl,
    category: String(category).trim() || 'Products',
    title,
    public: true,
    descriptive: {
      subcategory: product?.category ? String(product.category) : undefined,
      color: product?.color ? String(product.color) : undefined,
      season: undefined,
      caption: (raw.metaDesc || '').trim() || undefined,
      tags: (raw.keywords || '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 8),
    },
    attributes: cleanAttrs({
      sku: product?.sku || product?.mpn,
      price: raw.priceAmount || firstOffer(product)?.price,
      currency: raw.priceCurrency || firstOffer(product)?.priceCurrency,
    }),
  };
  return { isProduct, record };
}

function findProduct(ld) {
  const flat = [];
  const walk = (n) => {
    if (!n) return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (typeof n === 'object') {
      flat.push(n);
      if (n['@graph']) walk(n['@graph']);
    }
  };
  ld.forEach(walk);
  return flat.find((n) => {
    const t = n['@type'];
    return t && (Array.isArray(t) ? t.includes('Product') : String(t).includes('Product'));
  }) || null;
}

function productImage(p) {
  if (!p?.image) return null;
  const img = Array.isArray(p.image) ? p.image[0] : p.image;
  return typeof img === 'string' ? img : img?.url || null;
}
function firstOffer(p) {
  if (!p?.offers) return null;
  return Array.isArray(p.offers) ? p.offers[0] : p.offers;
}
function matchHint(url, title, hints) {
  const hay = `${url} ${title}`.toLowerCase();
  return hints.find((h) => hay.includes(h.toLowerCase())) || null;
}
function abs(base, maybe) { try { return maybe ? new URL(maybe, base).href : null; } catch { return null; } }
function cleanAttrs(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && String(v).length) out[k] = String(v);
  return out;
}

main().catch((err) => { log.err(err.stack || err.message); process.exit(1); });
