# Onboarding tools

Keyless OSS scripts that personalize the Vision Search demo for a customer website:
scrape a catalog, download images, derive a brand skin, and apply it to both apps.
The **binding interface** (command names, flags, JSON shapes, the palette→token mapping)
is pinned in [CONTRACT.md](CONTRACT.md) — read it before changing anything here.

These scripts are normally driven by the Copilot skills (`customer-onboarding` and its
sub-skills), but they also run standalone from the repo root.

## Prerequisites

```powershell
cd tools/onboarding
npm install
npx playwright install chromium   # or: npm run install:browsers
```

Node 20+. No API keys. `sharp` (image re-encode), `node-vibrant` (palette), `playwright`
+ `crawlee` (headless crawl), and `ajv` (manifest schema validation) install locally.

## Legal / ethical guardrails

Demo use only. The scrapers honor `robots.txt` and rate-limit by default. Scraped images
and text belong to their owners — keep the public app's "not affiliated" disclaimer and
remove customer data before any non-demo use. **Do not commit customer images or the
working `catalog.json` / `branding.json` to a shared branch** (they're git-ignored here).
Run a personalization on a throwaway branch so `git restore` / `git clean` fully unwinds it.

## The four steps (run from the repo root)

### 1. Discover a catalog — `scrape-catalog.mjs`

```powershell
node tools/onboarding/scrape-catalog.mjs --url https://www.example.com `
  [--map urls.json] [--max 40] [--categories "Toys,Games"] --out catalog.json
```

Discovers product pages (JSON-LD `Product`, OpenGraph, price meta, largest image) and
writes `catalog.json`. Downloads nothing. **Most reliable with `--map`** — a JSON file of
known product/category URLs, e.g.:

```json
{ "pages": [
  { "url": "https://www.example.com/p/wooden-train-set", "category": "Toys" },
  { "url": "https://www.example.com/p/card-game",        "category": "Games" }
] }
```

Review `catalog.json` (categories, public/internal split, metadata) **before** downloading.
See CONTRACT.md for the exact `catalog.json` shape.

### 2. Download + write manifest — `download-catalog.mjs`

```powershell
node tools/onboarding/download-catalog.mjs --input catalog.json `
  [--public-split "internal:Samples"] [--force]
```

Downloads each `imageUrl`, re-encodes to JPEG at `data/images/<Category>/<assetId>.jpg`
(`assetId = <category-lower>_<hash>`), merges `data/manifest.json`, and writes
`.metadata.json` sidecars (descriptive + `attributes` + provenance). Idempotent (skips
existing assets unless `--force`) and validated against `data/manifest.schema.json`.
`--public-split "internal:CatA,CatB"` forces those categories internal-only.

> v1 note: images are normalized to `.jpg` to match the Phase 1 pipeline (build-manifest /
> merge-sidecars / deploy-demo-data are `.jpg`-based). `attributes` stays in the sidecar
> until the schema is relaxed in Phase 5.

Optional: enrich descriptions with `src/hooks/enrich-metadata.ps1` (gpt-4o vision), then
mirror into the manifest with `src/scripts/merge-sidecars.ps1`.

### 3. Derive a brand skin — `extract-branding.mjs`

```powershell
node tools/onboarding/extract-branding.mjs --url https://www.example.com --out branding.json
```

Screenshots the homepage, pulls a `node-vibrant` palette + computed fonts + logo URL +
brand copy, and writes `branding.json` (a `<host>-home.png` screenshot lands beside it for
provenance). Downloads nothing else. See CONTRACT.md for the `branding.json` shape.

### 4. Apply the skin — `apply-branding.mjs`

```powershell
node tools/onboarding/apply-branding.mjs --input branding.json
```

Maps `palette` onto BOTH apps' theme tokens (public `forest/rose/paper…`, internal
`accent/blue/bg…`), sets `brand.*`, and rewrites each `public/config.js` while preserving
`apiBaseUrl`. Reload the apps (`npm run dev`) to preview; set `theme: {}` to restore the
built-in palette.

## Revert

No reset script — undo with git: `git restore <path>` (or `git restore .`) for tracked
edits, and `git clean -fd` to drop newly downloaded images/sidecars. Working on a throwaway
branch makes the whole run disposable.
