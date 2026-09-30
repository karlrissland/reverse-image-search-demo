---
name: adapt-layout
description: Use when going beyond the runtime skin to make the demo LOOK AND FLOW like the customer's site — layout, page structure, navigation, component arrangement, interaction patterns — by editing the React app code. Riskier than reskin (real code changes); opt-in; do it LAST, after branding/catalog/skin are confirmed and committed. e.g. "make it flow like their site", "match their layout/navigation", "adopt their look and feel".
---

# Adapt layout & flow (opt-in, do LAST)

`reskin` changes the **look** (theme tokens + copy, runtime, low risk). This skill changes the
**feel / flow** — real code edits to structure, layout, navigation, and component arrangement in the
two React apps so the demo resembles how the customer's own site is organized. Because it touches app
code, it is the **last, optional, highest-risk** stage: do it only after branding + catalog + skin are
verified and committed, so a failed attempt reverts cleanly.

## Preconditions (hard gates)
- Branding, catalog, and reskin are done, verified, and **committed** — a known-good rollback point
  exists (`git log --oneline` shows the stage commits).
- `git status` is clean before starting (work on a throwaway branch), so any failed attempt is one
  `git restore .` / `git checkout .` away from the last good commit.

## Scope (what you may change)
- Layout / structure / navigation in `src/apps/{public,internal}/src` (components, `App.tsx`,
  `styles.css`): hero arrangement, grid/gallery density, header + nav pattern, result-card layout,
  spacing rhythm, section order.
- **Approximate** the customer's flow — this is a demo, not a clone. Do not reproduce proprietary
  layouts pixel-for-pixel or embed proprietary assets.

## Hard invariants (never break)
- Core search: image / URL / crop search, facets, and no-strong-match guidance keep working.
- The public/internal response boundary — the public app must never render internal-only fields.
- The public "not affiliated" disclaimer stays.
- Accessibility basics (labels, contrast, keyboard) hold, and BOTH apps `npm run build` with
  frontend-ux-contract + unit tests green.

## Loop (small steps, commit each good step)
1. Pick ONE change (e.g. results grid → customer-style masonry). Keep scope tight.
2. Implement in the relevant component(s); preview with `npm run dev`.
3. Verify search + facets + the public/internal boundary still work; run `npm run build` + tests.
4. Show the user. On approval, **commit** with a descriptive message
   (e.g. `onboarding(layout): customer-style masonry results grid`).
5. If an attempt fails or the user dislikes it, `git restore .` / `git checkout .` back to the last
   good commit and try a different approach — never pile broken changes on top.

## When to stop
If flow work destabilizes the demo and can't be quickly fixed, revert to the last committed good state
and ship the branding + catalog + skin demo — that already stands on its own. Flow is a bonus, not a
requirement.

## References
Use the `frontend-and-api` skill for app structure, crop search, and the public/internal boundary.
