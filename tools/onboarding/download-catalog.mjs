// download-catalog.mjs — fetch images from a catalog.json, write data/images/<Category>/<assetId>.jpg,
// merge data/manifest.json, and write per-image .metadata.json sidecars. Idempotent + schema-validated.
// Interface pinned in tools/onboarding/CONTRACT.md.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import Ajv from 'ajv/dist/2020.js';
import {
  parseArgs, requireArg, repoRoot, dataRoot, stableHash,
  ensureDir, readJson, writeJson, existsSync, log,
} from './lib/util.mjs';

const DESCRIPTIVE = ['subcategory', 'collection', 'color', 'season', 'caption', 'tags'];
const MAX_WIDTH = 2000; // downscale huge product shots; never upscale

async function main() {
  const args = parseArgs();
  const inputPath = requireArg(args, 'input');
  const force = Boolean(args.force);
  const internalCats = parseInternalSplit(args['public-split']);

  const catalog = await readJson(inputPath);
  const items = Array.isArray(catalog.items) ? catalog.items : [];
  if (!items.length) throw new Error(`No items in ${inputPath}.`);

  const root = repoRoot();
  const data = dataRoot();
  const manifestPath = join(data, 'manifest.json');

  // Load + index existing manifest so we merge, never clobber.
  const existing = existsSync(manifestPath) ? await readJson(manifestPath) : [];
  const byId = new Map(existing.map((e) => [e.assetId, e]));

  let downloaded = 0, skipped = 0, failed = 0;

  for (const item of items) {
    const category = String(item.category || '').trim();
    if (!category) { log.warn(`Skipping item with no category: ${item.sourceUrl || item.imageUrl}`); failed++; continue; }
    if (!item.imageUrl) { log.warn(`Skipping "${item.title || category}" — no imageUrl.`); failed++; continue; }

    const hash = stableHash(item.sourceUrl, item.imageUrl);
    const assetId = `${category.toLowerCase()}_${hash}`;
    const relPath = `images/${category}/${hash}.jpg`;
    const absPath = join(data, relPath);
    const sidecarPath = join(data, `images/${category}/${hash}.metadata.json`);

    await ensureDir(join(data, 'images', category));

    if (existsSync(absPath) && !force) {
      skipped++;
    } else {
      try {
        const buf = await fetchImage(item.imageUrl);
        await sharp(buf)
          .resize({ width: MAX_WIDTH, withoutEnlargement: true })
          .jpeg({ quality: 82 })
          .toFile(absPath);
        downloaded++;
      } catch (err) {
        log.warn(`Failed "${item.title || assetId}": ${err.message}`);
        failed++;
        continue;
      }
    }

    const isPublic = internalCats.has(category.toLowerCase()) ? false : item.public !== false;
    const descriptive = pickDescriptive(item.descriptive);

    // Sidecar: descriptive + attributes + provenance (nested objects are ignored by the
    // manifest mirror + blob-metadata stamping, matching the enrichment sidecar shape).
    await writeJson(sidecarPath, {
      assetId,
      ...descriptive,
      ...(item.attributes && Object.keys(item.attributes).length ? { attributes: item.attributes } : {}),
      provenance: {
        source: 'scraped',
        sourceUrl: item.sourceUrl ?? null,
        imageUrl: item.imageUrl,
        site: catalog.site ?? null,
        scrapedAt: catalog.generatedAt ?? null,
        downloadedAt: new Date().toISOString(),
      },
    });

    // Manifest entry: schema fields only (attributes stay in the sidecar until Phase 5).
    byId.set(assetId, {
      assetId,
      imagePath: relPath,
      category,
      ...descriptive,
      public: isPublic,
    });
  }

  const manifest = [...byId.values()].sort((a, b) => a.imagePath.localeCompare(b.imagePath));
  await validateManifest(root, manifest);
  await writeJson(manifestPath, manifest);

  log.ok(`Catalog written: ${downloaded} downloaded, ${skipped} skipped, ${failed} failed. Manifest has ${manifest.length} assets.`);
  if (failed) log.warn('Some items failed — review the warnings above.');
  log.info('Next: enrich (optional) via src/hooks/enrich-metadata.ps1, then review + commit.');
}

function pickDescriptive(d) {
  const out = {};
  if (!d) return out;
  for (const k of DESCRIPTIVE) {
    if (d[k] === undefined || d[k] === null) continue;
    if (k === 'tags') { if (Array.isArray(d.tags) && d.tags.length) out.tags = d.tags.map(String); }
    else if (String(d[k]).length) out[k] = String(d[k]);
  }
  return out;
}

function parseInternalSplit(rule) {
  // Supported v1 form: "internal:CatA,CatB" or a bare comma list of internal-only categories.
  const set = new Set();
  if (!rule || rule === true) return set;
  const body = String(rule).replace(/^internal:/i, '');
  for (const c of body.split(',')) { const t = c.trim().toLowerCase(); if (t) set.add(t); }
  return set;
}

async function fetchImage(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get('content-type') || '';
  if (!type.startsWith('image/')) throw new Error(`not an image (${type || 'unknown'})`);
  return Buffer.from(await res.arrayBuffer());
}

async function validateManifest(root, manifest) {
  const schema = JSON.parse(await readFile(join(root, 'data', 'manifest.schema.json'), 'utf8'));
  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(schema);
  if (!validate(manifest)) {
    const msg = (validate.errors || []).slice(0, 8).map((e) => `  ${e.instancePath} ${e.message}`).join('\n');
    throw new Error(`Manifest failed schema validation:\n${msg}`);
  }
  const ids = manifest.map((m) => m.assetId);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) throw new Error(`Duplicate assetIds: ${[...new Set(dupes)].join(', ')}`);
}

main().catch((err) => { log.err(err.stack || err.message); process.exit(1); });
