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
If `robots.txt`/ToS disallows the target, **ask the user whether to continue** before scraping — don't
silently override or silently stop; proceed only if they explicitly accept responsibility.

## Interview / propose metadata
Map the customer's product data onto the existing **generic facets** (do not invent new index facets):
- `category` (required), `subcategory`, `color`, `season`, `caption`, `tags`, `public` (bool).
- Extra product data (price, SKU, material…) goes to sidecar **`attributes`** — passthrough only, not
  auto-faceted in v1 (a real new facet is a manual, out-of-scope extension; see Phase 5).

## Start from a clean corpus (fork only)
`download-catalog.mjs` **merges** into the existing `data/manifest.json` (it doesn't clobber), so a fork
still carries the neutral baseline's sample apparel. Loading a customer catalog on top mixes the two.
**Before the first customer download, clear the baseline sample corpus** so the demo shows only the
customer's items:
- Reset the manifest to empty: write `[]` to `data/manifest.json`.
- Remove the baseline sample images: e.g. `git rm -r data/images/Men data/images/Women`.
- **Keep** `data/manifest.schema.json`, the `data/README.md`, and the `Evaluation/` technical fixture.

Do this **in the customer fork only — never in the shared baseline repo** (the baseline keeps its sample
catalog as the working demo). Commit the clean slate before downloading so it's an easy rollback point.

## Steps
1. **Discover + extract** \u2192 run
   `scrape-catalog.mjs [--url <site>] [--category-urls "<listing1>,<listing2>"] [--map urls.json] [--max N] [--categories "A,B"] [--headless] [--channel msedge] --out catalog.json`.
   The script drives a real Edge/Chrome browser **headed by default** \u2014 watch the window and click
   through any bot challenge that appears. **Prefer `--category-urls`**, and get those URLs from the
   branding step: `extract-branding.mjs` writes a `navLinks` array (labeled homepage nav links). Read
   `branding.json` → `navLinks`, pick the ones that are real product categories (drop Account, Stores,
   Gift Cards, Help, Blog…), confirm the selection with the user, then pass them here. For each listing
   the script scrolls to load lazy images and harvests each product tile's URL + image + title
   **straight from the listing** (it does not open product pages — retail sites commonly bot-block deep
   product navigation). `--max` applies per category. Output is `catalog.json` only (no downloads yet).
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

## Fallback when the tools are blocked
The scraper makes the corpus accurate and precise, but a demo can be built with very little source
data if the site fights back (bot protection, JS-only rendering, hotlink-protected images, login
walls). Degrade gracefully instead of giving up:
0. **Drive the MCP browser first.** The script already runs a real Edge headed, but if it is still
   blocked, open the site in the keyless **Playwright MCP** browser (Edge, `.vscode/mcp.json`) and
   navigate it interactively — the human can clear the challenge, then you read product URLs/images
   directly and feed them back via `--map`. Only drop to screenshots/generation if that also fails.
1. **Screenshots first.** Ask the user to screenshot representative product listings/detail pages.
   You can read product names, categories, colors, and rough descriptions straight off those images
   and hand-author `catalog.json` entries against the [CONTRACT.md](../../../tools/onboarding/CONTRACT.md)
   shape.
2. **Generate approximate images when you can't download the real ones.** If product photos are
   blocked, use image generation to synthesize *representative, clearly-not-real* stand-in images
   from the product name/category (e.g. "a red satin costume cape on a plain studio background").
   Save them into `data/images/<Category>/` and reference them in `catalog.json` like any other image.
3. **Generate approximate descriptions/metadata.** Where real copy is unavailable, draft plausible
   `caption`/`tags`/`subcategory`/`color`/`season` values from the product name and screenshots. The
   optional gpt-4o enrich step can also fill these from whatever images you do have.
4. **Label the provenance.** Mark synthesized items in the sidecar `attributes` (e.g.
   `"source": "generated"`) so it's obvious which entries are approximations, and tell the user the
   catalog is representative rather than a faithful scrape. Keep the not-affiliated disclaimer.
More real data → more accurate demo; but even one screenshot plus generated images/descriptions is
enough to stand up a convincing customer-flavored corpus.

## Verify
After deploy/ingest, image/URL/crop search returns customer items, facets filter, and internal-only
items never appear in the public response. On approval, **commit** the manifest + images/sidecars with a
descriptive message before handing back to `customer-onboarding` for deploy/verify.
