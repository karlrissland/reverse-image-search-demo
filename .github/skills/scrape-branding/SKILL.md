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
2. **Extract branding** → run `extract-branding.mjs --url <site> [--headless] [--channel msedge] --out branding.json`
   *(Phase 3 script; see [CONTRACT.md](../../../tools/onboarding/CONTRACT.md) for the exact `branding.json`
   shape).* It drives a real Edge/Chrome browser **headed by default** (watch the window and click
   through any bot challenge), then uses node-vibrant for the palette, computed styles for fonts, and
   og:image/favicon/header `<img>` for the logo.
3. **Ground the palette in computed styles (mandatory, before Review).** node-vibrant samples a
   *screenshot*, so it misreads light-chrome / dark-hero retail sites. Before trusting the palette,
   read the site's **actual** computed styles and reconcile:
   - Use `branding.json` → `computedStyles` (the extractor now emits header/nav/body/primary-button
     `backgroundColor`/`color` plus `:root` custom properties). If it's missing or sparse, open the
     live site (headed script or Playwright MCP) and read the computed `background-color`/`color` for
     header, nav, body, and primary buttons, plus any `:root` CSS variables, yourself.
   - Prefer the site's real hexes for `primary`/`background`/`ink`/`muted`; treat node-vibrant swatches
     as a fallback, not the source of truth. Every hex in `branding.json` must trace to the live site.
   - **Do not invent a palette from brand stereotypes** (e.g. "Halloween → dark"). If you want to
     propose a creative deviation (e.g. a dark theme), label it as a deviation and get explicit
     sign-off — never present it as "the brand."
   - **Light-chrome / dark-hero trap:** retail sites often pair white UI chrome with a dark promo hero
     banner; a dominant-color sampler can key on either. Separate chrome color (header/nav/body) from
     marketing imagery, and base the UI palette on the chrome.
4. **Review** the proposed `branding.json` with the user as a **side-by-side diff**, not isolated
   swatches: put a screenshot of the live site next to the running app (preview with `npm run dev` or
   reload the built site) and approve the match. Cover palette, fonts, logo URL, and the `brand.*` copy
   (name, tagline, hero title/subtitle, footer note, page title). Isolated swatch review hides a wrong
   theme; the side-by-side surfaces it immediately. Adjust before applying.
   The file also carries a `navLinks` array (labeled homepage nav/category links) — hand these to the
   `build-catalog` step as candidate `--category-urls` (curate out Account/Stores/Help/etc. first).
5. **Apply** → run `apply-branding.mjs --input branding.json`. This maps the palette onto BOTH apps'
   token sets (they differ — see the mapping table in CONTRACT.md) and sets `brand.*`, preserving each
   app's `apiBaseUrl`.

## Token mapping (why two sets)
- Public app tokens: `paper, surface, ink, muted, line, forest, forest-hover, rose, soft, danger`.
- Internal app tokens: `bg, surface, surface-2, ink, muted, line, accent, accent-dark, blue, danger`.
- `primary→forest/accent`, `primaryHover→forest-hover/accent-dark`, `secondary→rose/blue`,
  `background→paper/bg`. Full table in CONTRACT.md. Setting `theme: {}` restores the built-in palette.

## Fidelity
- **Runtime skin:** palette + `brand.*` copy via `config.js` (edit + reload, no rebuild).
- **Logo + fonts:** done as **direct code edits** in `reskin` — swap the logo into each app's `public/`
  and adjust font stacks in `styles.css`. `branding.json`'s `logoUrl`/`fonts` are the AI's *inputs* for
  those edits, not a runtime slot.

## Fallback when the tools are blocked
The scraper makes extraction accurate and precise, but it is not required. Some sites use bot
protection (Akamai/Cloudflare/PerimeterX), aggressive JS, or a login wall that blocks headless
navigation — `extract-branding.mjs` will then time out or return mostly defaults. When that happens,
**escalate before approximating**:
0. **Drive the MCP browser first.** The script already runs a real Edge headed, but if it is still
   blocked, open the homepage in the keyless **Playwright MCP** browser (Edge, `.vscode/mcp.json`)
   and navigate interactively so the human can clear the challenge. Then read the palette off a
   screenshot and the logo/fonts/copy off the rendered DOM, and hand-fill `branding.json`. Only fall
   back to pure approximation if even the MCP browser can't reach the site.

When no browser can reach it, **approximate the branding from what a human can see** instead of stalling:
1. **Ask the user for screenshots.** Have them open the site in a normal browser and capture the
   homepage, a category/product page, and the header/footer (logo, nav, buttons). They can drag the
   images into chat.
2. **Read the branding off the screenshots.** Eyeball the dominant/accent colors, the general font
   feel (serif vs sans, weight), the wordmark, and the tone of the hero/marketing copy. If the user
   can share the logo file or an exact hex/brand-guide, even better.
3. **Hand-fill `branding.json`** with those approximations (palette hexes, font family names, `logoUrl`
   or a saved local logo, `brand.*` copy) using the exact shape in
   [CONTRACT.md](../../../tools/onboarding/CONTRACT.md), then run `apply-branding.mjs` as usual.
4. **Be explicit that it's an approximation.** Tell the user these values were eyeballed, not measured,
   and invite corrections in the review step. A close-enough skin is fine for a demo; the disclaimer
   already makes the not-affiliated status clear.

## Verify
Reload each app (or `npm run dev`) and confirm the header wordmark, hero copy, page title, and accent
colors reflect the customer. On approval, **commit** `branding.json` + the updated `config.js` with a
descriptive message before handing back to `reskin` for iteration or `customer-onboarding` for catalog.
