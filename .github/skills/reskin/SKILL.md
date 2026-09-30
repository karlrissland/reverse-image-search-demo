---
name: reskin
description: Use when applying, previewing, and iterating the customer visual skin on the two React apps — e.g. "tweak the hero copy", "the accent is too dark", "iterate the skin", "make the public site match closer". Handles the edit → preview → refine → (deploy) loop over brand + theme in both public/config.js files.
---

# Reskin (apply & iterate)

Own the fast visual iteration loop after `scrape-branding` has produced a first skin. Skinning is
runtime via `window.__VISIONSEARCH__` (`brand` + `theme`) in each app's `public/config.js` — edit and
reload, no rebuild needed to preview.

## What you can change (v1)
- `brand.*`: `name`, `tagline`, `heroTitle`, `heroSubtitle`, `footerNote`, `homeAriaLabel`, `pageTitle`.
- `theme` tokens (CSS custom properties). Public and internal apps use **different** token names:
  - Public: `paper, surface, ink, muted, line, forest, forest-hover, rose, soft, danger`.
  - Internal: `bg, surface, surface-2, ink, muted, line, accent, accent-dark, blue, danger`.
  - Keep both apps visually consistent; the palette→token mapping is in
    [CONTRACT.md](../../../tools/onboarding/CONTRACT.md).
- **Logo + fonts** are done as **direct code edits** (not config slots): drop the customer logo into each
  app's `public/` and replace the header wordmark `<span>` with an `<img>`; change the font stacks (and
  add an `@font-face`/`@import`) directly in `styles.css`. Deeper color/spacing tuning is also just
  editing `styles.css`. A rebuild is needed to preview these (vs. runtime for `config.js` changes).
- Structural **layout / flow** (page structure, navigation, component arrangement) is out of scope here
  — that's the `adapt-layout` skill (opt-in, riskier, do last).

## Loop
1. **Apply** — prefer `apply-branding.mjs --input branding.json` for a full re-skin; for small tweaks,
   edit the two `config.js` files directly. Always preserve `apiBaseUrl`.
2. **Preview** — `npm run dev` in `src/apps/public` and `src/apps/internal` (or reload the built site).
3. **Refine** — adjust copy/tokens with the user; keep the public "not affiliated" disclaimer.
4. **Build check** — `npm run build` in each app; keep frontend-ux-contract + unit tests green.
5. **Commit** — on the user's approval, commit the skin with a descriptive message
   (e.g. `onboarding(skin): refine hero copy + accent`) so it's a known-good rollback point.
6. **Deploy (optional)** — hand to `customer-onboarding` / `azure-deployment` for `azd` + `verify-sites.ps1`.

## Guardrails
Demo-only; public disclaimer stays; don't commit customer assets to a shared branch. To revert to the
neutral baseline, set `theme: {}` and restore default `brand`, or use git (`git restore` / `git clean`).

## Verify
Both apps render the customer skin, titles/hero/footer read correctly, contrast is legible, and the
default palette still restores cleanly when `theme` is emptied.
