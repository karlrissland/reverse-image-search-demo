---
name: build-catalog
description: Use when populating this demo's image corpus and metadata from a customer website — e.g. "load <site>'s products", "scrape the catalog from <site>", "build a catalog for the demo". Discovers product pages, downloads images, and writes data/manifest.json + sidecars validated against the schema.
---

# Build catalog

Turn a customer's product pages into the demo's searchable corpus: images in Blob-backed
`data/images/<Category>/` plus `data/manifest.json` and per-image `.metadata.json` sidecars.

## Guardrails
Demo-only; honor `robots.txt` and rate limits (the scraper does by default); keep public/internal
boundaries correct; never commit customer images to a shared branch. Preserve Unicode (e.g. `rosé`).

## Interview / propose metadata
Map the customer's product data onto the existing **generic facets** (do not invent new index facets):
- `category` (required), `subcategory`, `color`, `season`, `caption`, `tags`, `public` (bool).
- Extra product data (price, SKU, material…) goes to sidecar **`attributes`** — passthrough only, not
  auto-faceted in v1 (a real new facet is a manual, out-of-scope extension; see Phase 5).

## Steps
1. **Discover + extract** → run
   `scrape-catalog.mjs --url <site> [--map urls.json] [--max N] [--categories "A,B"] --out catalog.json`.
   Use the Playwright MCP server first to confirm which pages are product pages and where images live,
   then let Crawlee do the bulk pass. Output is `catalog.json` only (no downloads yet).
   *(Phase 3 script; `catalog.json` shape is pinned in [CONTRACT.md](../../../tools/onboarding/CONTRACT.md).)*
2. **Review** `catalog.json` with the user: category assignments, public/internal split, counts,
   descriptive fields. Fix here before downloading.
3. **Download + write** → run `download-catalog.mjs --input catalog.json`. Downloads images to
   `data/images/<Category>/`, merges `data/manifest.json`, writes sidecars. Idempotent + schema-validated.
4. **(Optional) enrich** → `src/hooks/enrich-metadata.ps1` for gpt-4o vision sidecars (subcategory/color/
   season/caption/tags). Pass the AI Services **account base** endpoint, not a project URL.
5. **Validate** → confirm the manifest passes `data/manifest.schema.json` (unique `assetId`, required
   `assetId/imagePath/category/public`, no disallowed keys), category folders match, Unicode intact.

## assetId convention
`<category-lower>_<stableHash(sourceUrl|imageUrl)>`, matching the Phase 1 layout, so re-runs are stable
and merges are idempotent.

## Verify
After deploy/ingest, image/URL/crop search returns customer items, facets filter, and internal-only
items never appear in the public response. On approval, **commit** the manifest + images/sidecars with a
descriptive message before handing back to `customer-onboarding` for deploy/verify.
