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

### Browser driving (scrapers #1 and #3)

The two scraping scripts drive a **real installed browser channel** (Microsoft **Edge** first, then
Chrome) via raw Playwright — not bundled headless Chromium, which retail bot walls detect and stall.
They run **headed by default** so a human can click through any bot challenge / CAPTCHA in the window.
Shared flags:

- `--headless` — opt out of headed mode (CI / cooperative sites). Default is headed.
- `--channel <msedge|chrome>` — pin a specific channel. Default tries `msedge` then `chrome`, then
  falls back to bundled Chromium with a warning.

**Bot-protected sites (escalation).** If even the headed real browser is blocked, or the site is
JS-only / behind a login wall, escalate to the keyless **Playwright MCP** browser (Edge) configured in
`.vscode/mcp.json` and drive it interactively (human-in-the-loop) to read branding/URLs. If that still
fails, fall back to **approximation** (screenshots the user provides + generated stand-in catalog
images), clearly marking what is approximated vs scraped. See the personalization skills.

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
node tools/onboarding/scrape-catalog.mjs [--url <site>] \
  [--category-urls "<listing1>,<listing2>"] [--map <urls.json>] \
  [--max <n>] [--categories "A,B,C"] [--headless] [--channel msedge] --out catalog.json
```

- Raw Playwright (real Edge/Chrome channel, headed by default). **Downloads nothing.** Output only:
  `catalog.json` (shape below). Three input modes, in order of preference:
  1. **`--category-urls "<u1>,<u2>"` (preferred)** — each URL is a **category listing page**; the script
     loads it, scrolls to trigger lazy images, and harvests product data (URL + image + title) straight
     from the listing tiles. It does **not** open each product page — many retail sites bot-block deep
     product navigation, and the listing tile already carries what a demo corpus needs. The category
     name is derived from the listing (h1/og:title) or supplied via the `--map` object form. Sibling
     subcategory tiles (those sharing the listing's first path segment) are dropped. `--max` is applied
     **per category**. The category URLs typically come from `extract-branding.mjs`'s `navLinks` output
     (run branding first, curate its nav links, feed the product categories here).
  2. **`--map <urls.json>`** — a JSON file. `{ "categories": [ {"name":"Women","url":"…"}, "…" ] }`
     expands listing pages (same as mode 1, with optional explicit names). A bare array or
     `{ "pages": […] }` is treated as **direct product-page URLs**. Use this when category URLs contain
     commas or you want to name categories.
  3. **`--url <site>` only** — fallback bounded, robots-aware same-origin crawl from the homepage.
- `--url` is optional when `--category-urls`/`--map` is given (origin is taken from the first URL).
- `--max` caps items (per category in modes 1–2, total in mode 3). `--categories` supplies name hints.
- `--headless` / `--channel` as described in **Browser driving** above.

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
node tools/onboarding/extract-branding.mjs --url <site> [--headless] [--channel msedge] --out branding.json
```

- Playwright screenshots (real Edge/Chrome channel, headed by default) + node-vibrant palette;
  computed styles → fonts; og:image/favicon/header `<img>` → logo URL. Emits `branding.json`
  (shape below). Downloads nothing (a `<host>-home.png` screenshot is written beside `--out`).
- Also emits `computedStyles` — the site's **actual** computed colors for header, nav, body, and the
  first opaque primary button (`backgroundColor`/`color`), plus any `:root` CSS custom properties
  (`rootVars`). These ground the Review step in real values instead of a dominant-color sampler that
  misreads light-chrome / dark-hero retail sites. Reconcile node-vibrant's swatches against these and
  prefer the site's actual hexes for `primary`/`background`/`ink`/`muted`.
- Also harvests the homepage's primary navigation into `navLinks` (labeled, same-origin candidate
  category URLs). These are **advisory** — not applied to the skin — and exist so the AI can curate
  the real product categories and feed them to `scrape-catalog.mjs --category-urls`.

## 4. `apply-branding.mjs` — map branding into both apps

```
node tools/onboarding/apply-branding.mjs --input branding.json
```

- Maps `palette` → the two apps' theme token sets (mapping table below) and sets `brand.*` text,
  merging into both `config.js` files and preserving `apiBaseUrl`. `logoUrl`/`fontUrl` are **not**
  written as runtime slots — the logo swap and font changes are AI-directed edits to `public/` and
  `styles.css` (see the `reskin` skill).

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
  "computedStyles": {
    "header": { "selector": "header", "backgroundColor": "rgb(255, 255, 255)", "color": "rgb(14, 11, 18)" },
    "nav":    { "selector": "nav, [role=\"navigation\"]", "backgroundColor": "rgb(255, 255, 255)", "color": "rgb(14, 11, 18)" },
    "body":   { "backgroundColor": "rgb(14, 11, 18)", "color": "rgb(244, 240, 250)" },
    "button": { "backgroundColor": "rgb(91, 42, 134)", "color": "rgb(255, 255, 255)" },
    "rootVars": { "--brand": "#5b2a86", "--bg": "#0e0b12" }
  },
  "navLinks": [
    { "label": "Women's Costumes", "url": "https://www.example.com/category/womens/..." },
    { "label": "Decorations", "url": "https://www.example.com/category/decor/..." }
  ],
  "provenance": { "screenshots": ["home.png"], "swatchSource": "node-vibrant", "computedStyles": true }
}
```

- `computedStyles` is the site's **actual** computed colors (header/nav/body/primary-button fg+bg) plus
  any `:root` custom properties (`rootVars`). It is grounding evidence for Review — prefer these hexes
  over node-vibrant swatches for `primary`/`background`/`ink`/`muted`. Any field may be `null` if the
  element/stylesheet wasn't found (cross-origin stylesheets are skipped).

- `navLinks` are **advisory** candidate category URLs harvested from the homepage nav (not applied to
  the skin). Curate them into product categories and pass to `scrape-catalog.mjs --category-urls`.

`brand.logoUrl`, `brand.fontUrl`, and `fonts.*` are **advisory inputs** — the AI uses them to edit the
apps' `styles.css` (fonts) and swap the header logo in `public/` during `reskin`. They are not consumed
by a runtime slot; only `brand.*` text and `theme` tokens are read from `config.js` at runtime.

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
