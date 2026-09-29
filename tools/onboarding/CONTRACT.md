# Onboarding script contract (v1)

> **Status:** SPEC ONLY. These scripts are authored in **Phase 3**. This file is the binding
> interface the Phase 2 skills reference and the Phase 3 implementation MUST honor verbatim.
> If an implementation detail must change, update this contract first, then the skills, then the code.

The personalization skills (`.github/skills/{customer-onboarding,scrape-branding,build-catalog,reskin}`)
describe *workflow and guardrails*. The scripts below do the *work*. Keeping the command names, flags,
and JSON shapes fixed here means the skills never drift from the eventual implementation.

All scripts live in `tools/onboarding/` (a self-contained Node package, its own `package.json`).
They are keyless, idempotent, honor `robots.txt`, and rate-limit by default. Run from the repo root
unless noted. Node 20+; browsers installed via `npx playwright install`.

---

## Data locations (targets the scripts write)

- Images: `data/images/<Category>/<assetId>.<ext>` (category folders, matching the Phase 1 layout).
- Manifest: `data/manifest.json` (array; schema `data/manifest.schema.json`). Merge, don't clobber.
- Sidecars: `data/images/<Category>/<assetId>.metadata.json` (descriptive + attributes + provenance).
- Public site config: `src/apps/public/public/config.js` (`window.__VISIONSEARCH__`).
- Internal site config: `src/apps/internal/public/config.js` (`window.__VISIONSEARCH__`).

---

## 1. `scrape-catalog.mjs` — discover products, emit a catalog

```
node tools/onboarding/scrape-catalog.mjs --url <site> [--map <urls.json>] \
  [--max <n>] [--categories "A,B,C"] --out catalog.json
```

- Crawls with Crawlee + Playwright to discover product pages and extract product info + image URLs.
- `--map` optionally supplies known page/category URLs to skip discovery.
- `--max` caps items (per run) for quick demos. `--categories` constrains discovery.
- **Downloads nothing.** Output only: `catalog.json` (shape below).

## 2. `download-catalog.mjs` — fetch images, write manifest + sidecars

```
node tools/onboarding/download-catalog.mjs --input catalog.json [--public-split <rule>]
```

- Downloads each `imageUrl` to `data/images/<Category>/<assetId>.<ext>`.
- Writes/merges `data/manifest.json` and per-image `.metadata.json` sidecars.
- Idempotent (re-running skips existing assets unless `--force`), schema-validated at the end.
- `assetId` = `<category-lower>_<stableHash(sourceUrl|imageUrl)>` (matches Phase 1 convention).

## 3. `extract-branding.mjs` — palette, fonts, logo, copy

```
node tools/onboarding/extract-branding.mjs --url <site> --out branding.json
```

- Playwright screenshots + node-vibrant palette; computed styles → fonts; og:image/favicon/header
  `<img>` → logo URL. Emits `branding.json` (shape below). Downloads nothing.

## 4. `apply-branding.mjs` — map branding into both apps

```
node tools/onboarding/apply-branding.mjs --input branding.json
```

- Maps `palette` → the two apps' theme token sets (mapping table below), sets `brand.*`, and
  (Phase 4) writes `logoUrl` / `fontUrl`. Merges into both `config.js` files, preserving `apiBaseUrl`.

## 5. Reset — use git (no reset script)

Personalization edits files in place, so undo is a git operation, not a bundled script:
- `git status` / `git diff` to review changes; `git restore <path>` (or `git restore .`) to revert
  tracked edits to `config.js`, `data/manifest.json`, etc.
- `git clean -nd` (preview) then `git clean -fd` to remove newly downloaded images/sidecars.
- Recommend running personalization on a throwaway branch so revert is trivial.

---

## `catalog.json` shape (output of #1, input of #2)

```json
{
  "site": "https://www.example.com",
  "generatedAt": "2026-09-29T00:00:00Z",
  "categories": ["Toys", "Games"],
  "items": [
    {
      "sourceUrl": "https://www.example.com/p/wooden-train-set",
      "imageUrl": "https://cdn.example.com/img/wooden-train-set.jpg",
      "category": "Toys",
      "title": "Classic Wooden Train Set",
      "public": true,
      "descriptive": {
        "subcategory": "Vehicles",
        "color": "Multicolor",
        "season": "All-season",
        "caption": "Classic wooden train with magnetic cars.",
        "tags": ["train", "wooden", "classic"]
      },
      "attributes": { "sku": "TT-1043", "price": "39.99" }
    }
  ]
}
```

- `category` MUST be one of `categories`. `public` decides public-site visibility.
- `descriptive.*` map 1:1 onto the manifest's generic facet fields (subcategory/color/season/caption/tags).
- `attributes` is **passthrough** (sidecar-only, NOT auto-faceted) — reserved for v1 (see Phase 5).

## `branding.json` shape (output of #3, input of #4)

```json
{
  "site": "https://www.example.com",
  "generatedAt": "2026-09-29T00:00:00Z",
  "brand": {
    "name": "Tailwind Toys",
    "tagline": "Toys & games",
    "heroTitle": "Find the look from any image.",
    "heroSubtitle": "Upload a product photo and discover similar toys.",
    "footerNote": "Visual search demo. Not affiliated with the brand.",
    "pageTitle": "Vision Search",
    "logoUrl": "https://www.example.com/logo.svg",
    "fontUrl": "https://fonts.googleapis.com/css2?family=..."
  },
  "palette": {
    "primary": "#5b2a86",
    "primaryHover": "#3f1d5e",
    "secondary": "#ff6a00",
    "background": "#0e0b12",
    "surface": "#161020",
    "ink": "#f4f0fa",
    "muted": "#b6a9c9",
    "line": "#2a2036",
    "danger": "#e5484d"
  },
  "fonts": { "heading": "Poppins, sans-serif", "body": "Inter, sans-serif" },
  "provenance": { "screenshots": ["home.png"], "swatchSource": "node-vibrant" }
}
```

`brand.logoUrl`, `brand.fontUrl`, and `fonts.*` are consumed only once **Phase 4** lands; earlier
phases ignore them safely.

## Palette → theme-token mapping (used by #4)

The two apps expose **different** CSS token names. `apply-branding.mjs` writes both:

| `branding.json` palette | public app token (`config.js` theme) | internal app token (`config.js` theme) |
|-------------------------|--------------------------------------|----------------------------------------|
| `primary`               | `forest`                             | `accent`                               |
| `primaryHover`          | `forest-hover`                       | `accent-dark`                          |
| `secondary`             | `rose`                               | `blue`                                 |
| `background`            | `paper`                              | `bg`                                   |
| `surface`               | `surface`                            | `surface`                              |
| `ink`                   | `ink`                                | `ink`                                  |
| `muted`                 | `muted`                              | `muted`                                |
| `line`                  | `line`                               | `line`                                 |
| `danger`                | `danger`                             | `danger`                               |

Public also has `soft`; internal also has `surface-2` — leave at defaults unless a good source exists.
Never remove `apiBaseUrl`. Setting `theme: {}` restores the built-in palette.
