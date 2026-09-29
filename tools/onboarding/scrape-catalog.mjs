// scrape-catalog.mjs — discover product pages on a customer site and emit catalog.json.
// Downloads nothing. Crawlee + Playwright, robots-aware, rate-limited. Prefer --map for
// reliable runs. Interface pinned in tools/onboarding/CONTRACT.md.
import { PlaywrightCrawler } from 'crawlee';
import { parseArgs, requireArg, readJson, writeJson, log } from './lib/util.mjs';
import { loadRobots } from './lib/robots.mjs';

async function main() {
  const args = parseArgs();
  const startUrl = requireArg(args, 'url');
  const outPath = requireArg(args, 'out');
  const max = Number(args.max ?? 40);
  const categoryHints = String(args.categories ?? '').split(',').map((c) => c.trim()).filter(Boolean);
  const origin = new URL(startUrl).origin;

  const robots = await loadRobots(origin);
  const items = [];
  const seen = new Set();

  const push = (rec) => {
    if (items.length >= max) return;
    if (!rec || !rec.imageUrl || seen.has(rec.sourceUrl || rec.imageUrl)) return;
    seen.add(rec.sourceUrl || rec.imageUrl);
    items.push(rec);
  };

  const ctx = { origin, robots, categoryHints, push, max, count: () => items.length };

  if (args.map) {
    // Reliable path: caller supplies known product/category URLs (skip discovery heuristics).
    const map = await readJson(String(args.map));
    const urls = normalizeMap(map);
    await crawlUrls(urls, ctx);
  } else {
    await discover(startUrl, ctx);
  }

  const categories = [...new Set(items.map((i) => i.category))].sort();
  await writeJson(outPath, {
    site: origin,
    generatedAt: new Date().toISOString(),
    categories,
    items: items.slice(0, max),
  });
  log.ok(`Wrote ${Math.min(items.length, max)} item(s) across ${categories.length} categor(y|ies) to ${outPath}.`);
  log.info('Review catalog.json (categories, public split, metadata) BEFORE running download-catalog.mjs.');
}

function normalizeMap(map) {
  if (Array.isArray(map)) return map.map((m) => (typeof m === 'string' ? { url: m } : m));
  if (Array.isArray(map.pages)) return map.pages.map((m) => (typeof m === 'string' ? { url: m } : m));
  return [];
}

async function discover(startUrl, ctx) {
  const { robots, push, max } = ctx;
  const crawler = new PlaywrightCrawler({
    maxConcurrency: 2,
    maxRequestsPerCrawl: Math.max(20, max * 5),
    navigationTimeoutSecs: 45,
    requestHandlerTimeoutSecs: 60,
    async requestHandler({ page, request, enqueueLinks }) {
      if (ctx.count() >= max) return;
      const path = new URL(request.url).pathname;
      if (!robots.isAllowed(path)) return;
      const info = await extract(page, request.url, ctx);
      if (info.isProduct) push(info.record);
      if (ctx.count() < max) {
        await enqueueLinks({
          strategy: 'same-origin',
          transformRequestFunction: (req) => (robots.isAllowed(new URL(req.url).pathname) ? req : false),
        });
      }
    },
    failedRequestHandler({ request }) {
      log.warn(`Failed: ${request.url}`);
    },
  });
  await crawler.run([startUrl]);
}

async function crawlUrls(urls, ctx) {
  const { robots, push } = ctx;
  const crawler = new PlaywrightCrawler({
    maxConcurrency: 2,
    navigationTimeoutSecs: 45,
    async requestHandler({ page, request }) {
      const path = new URL(request.url).pathname;
      if (!robots.isAllowed(path)) { log.warn(`robots.txt disallows ${path} — skipping.`); return; }
      const category = request.userData?.category;
      const info = await extract(page, request.url, { ...ctx, forcedCategory: category });
      // For an explicit map we trust the URL is a product page even if heuristics are unsure.
      push(info.record);
    },
  });
  await crawler.run(urls.map((u) => ({ url: u.url, userData: { category: u.category } })));
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
