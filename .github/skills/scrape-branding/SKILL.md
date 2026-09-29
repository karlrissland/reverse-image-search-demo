---
name: scrape-branding
description: Use when deriving a visual skin (color palette, fonts, logo, hero copy) from a customer website and applying it to this demo's two React apps — e.g. "match the branding of <site>", "pull <brand>'s colors", "skin the apps like <site>". Produces branding.json and writes brand + theme into both public/config.js files.
---

# Scrape branding

Derive a runtime skin from a customer's website and apply it to both apps. Skinning is **runtime**
(`window.__VISIONSEARCH__` in each app's `public/config.js`) — no rebuild required to preview.

## Guardrails
Follow the onboarding guardrails: demo-only, respect `robots.txt`, keep the public "not affiliated"
disclaimer. Do not commit customer logos/assets to a shared branch.

## Steps
1. **Inspect the site** with the Playwright MCP server: navigate to the homepage (and a category page),
   capture a screenshot, and read computed styles for dominant fonts.
2. **Extract branding** → run `extract-branding.mjs --url <site> --out branding.json`
   *(Phase 3 script; see [CONTRACT.md](../../../tools/onboarding/CONTRACT.md) for the exact `branding.json`
   shape).* It uses node-vibrant for the palette, computed styles for fonts, and og:image/favicon/header
   `<img>` for the logo.
3. **Review** the proposed `branding.json` with the user: palette swatches, fonts, logo URL, and the
   `brand.*` copy (name, tagline, hero title/subtitle, footer note, page title). Adjust before applying.
4. **Apply** → run `apply-branding.mjs --input branding.json`. This maps the palette onto BOTH apps'
   token sets (they differ — see the mapping table in CONTRACT.md) and sets `brand.*`, preserving each
   app's `apiBaseUrl`.

## Token mapping (why two sets)
- Public app tokens: `paper, surface, ink, muted, line, forest, forest-hover, rose, soft, danger`.
- Internal app tokens: `bg, surface, surface-2, ink, muted, line, accent, accent-dark, blue, danger`.
- `primary→forest/accent`, `primaryHover→forest-hover/accent-dark`, `secondary→rose/blue`,
  `background→paper/bg`. Full table in CONTRACT.md. Setting `theme: {}` restores the built-in palette.

## Fidelity
- **v1 (now):** palette + `brand.*` copy. Logo image and web fonts are wired in **Phase 4**
  (`brand.logoUrl` / `brand.fontUrl` are written but only render once Phase 4 lands — harmless earlier).

## Verify
Reload each app (or `npm run dev`) and confirm the header wordmark, hero copy, page title, and accent
colors reflect the customer. On approval, **commit** `branding.json` + the updated `config.js` with a
descriptive message before handing back to `reskin` for iteration or `customer-onboarding` for catalog.
