# Plan: Copilot-driven customer personalization of the Vision Search demo

## Goal
Let anyone fork this repo, open GitHub Copilot, point at a customer website, answer a few
questions, and end up with a customer-branded, catalog-populated, deploy-ready reverse image
search demo. Delivered through Copilot skills + **keyless, open-source** web scraping + thin
deterministic Node scripts + docs. Edits are applied **in place** (the fork is handed to the customer).

### Baseline vs. fork (two repos, two rules)
- **This repo is the baseline/template** and stays generic. Customer-specific bytes — branding
  values, logos, catalog images, skinned `config.js` — must **never enter its history**, including
  while we build and test the personalization tooling here.
- **A fork is where personalization happens.** Edits are applied in place, then the customized fork is
  **committed and pushed**, so the customer clones a fully-personalized starting point. Customer data
  *is* meant to be versioned — just in the fork, never in the baseline.
- Practical consequence: "clean" applies to the **baseline**, not to every run. A fork is *supposed* to
  end customized-and-committed.

## Confirmed decisions
- In-place editing (no per-customer folders); revert via `git restore` / `git clean` (no reset script).
- **Keyless, all open-source** scraping. No Firecrawl, no API keys, no per-request limits.
- Iterative fidelity: start with a simple skin, deploy, test, then refine until the demoer is happy.
- Interview-driven / variable metadata; Copilot proposes fields from the site; enrichment optional.
- **v1 facets LOCKED**: existing generic facets (category / subcategory / collection / color / season /
  tags) + an optional `attributes` passthrough. No dynamic-facet engine.
- Skills: orchestrator + focused sub-skills (`scrape-branding`, `build-catalog`, `reskin`).
- **User checkpoint after every phase** — the user reads and verifies the artifacts before the next
  phase starts. Nothing proceeds past a checkpoint without explicit approval.
- **Baseline hygiene: customize in a fork, never the baseline.** A live customer run — whether for
  our own testing or a real handoff — happens in a **fork** of this repo, not in the baseline. The
  fork is both the test vehicle and the artifact handed to the customer (they clone it). The baseline
  is only ever edited to improve the **generic tooling/code**; its tracked sample corpus
  (`data/images`, `data/manifest.json`) and neutral `config.js` are the reference point and are never
  overwritten by a customer run. As a backstop against accidental pollution, keep customer working
  artifacts gitignored (`branding.json`, `catalog.json`, `*-home.png`, and — when added —
  `data/.customer/`, `public/brand/`, an optional `config.local.js` overlay) and add a **pre-flight
  guard** that fails if any customer artifact is staged in the baseline.

## Scraping stack (keyless, all OSS)
- **Playwright MCP** (`npx @playwright/mcp@latest`, Apache-2.0, Microsoft, keyless, 1-click VS Code
  install): the agent's live browser for design-language analysis, catalog navigation, screenshots,
  and DOM/product data.
- **Node scraper** under `tools/onboarding/` on **Crawlee** (Apache-2.0) + **Playwright**: the
  deterministic bulk — discover product pages, extract product info, download images, write manifest.
- **node-vibrant** (MIT): derive the theme palette from a homepage/logo screenshot. Playwright
  computed styles for fonts; `og:image` / favicon / header `<img>` for the logo.

## Existing machinery reused (not rebuilt)
- Manifest `data/manifest.json` (schema `data/manifest.schema.json`): assetId, imagePath, category(req),
  subcategory, collection, color, season, caption, tags[], celebrity, celebritySource, public(req).
  Sidecars: `data/images/<category>/<id>.metadata.json`.
- Hooks (azd `postprovision` -> `src/hooks/deploy.ps1`): `configure-sites.ps1` (stamps apiBaseUrl,
  preserves brand/theme), `deploy-demo-data.ps1` (blob upload + metadata), `configure-search.ps1`
  (index/skillset/indexer via `SearchSchema.psm1`), `enrich-metadata.ps1` (gpt-4o captions, manual).
- Branding layer (already built): `src/apps/{internal,public}/src/branding.ts` + `public/config.js`
  `window.__VISIONSEARCH__.brand` + `theme`; `applyBranding()` sets CSS vars + title.
  Internal tokens: bg, surface, surface-2, ink, muted, line, accent, accent-dark, blue, danger,
  strong, fair, weak, shadow. Public tokens: paper, surface, ink, muted, line, forest, forest-hover,
  rose, soft, danger, shadow. Wordmark is text-only today.
- `azure.yaml`: services api(function), internal + public(staticwebapp, dist). postdeploy `verify-sites.ps1`.

## Phases (each ends with a mandatory user checkpoint)

### Phase 0 — Trackers
- Write repo-root `plan.md` (this file) and `status.md` (step-by-step checklist with a checkpoint row
  per phase). Keep `status.md` current as work proceeds.
- **CHECKPOINT 0:** user reads `plan.md` + `status.md` and confirms scope/approach.

### Phase 1 — Establish the baseline
Prove the demo works end-to-end with a known-good test dataset and the neutral skin BEFORE building
any personalization tooling — this is the reference point every customer run is compared against.
- Obtain/confirm a small set of test images + metadata: use the repo's existing sample corpus if
  present, otherwise assemble a small neutral, license-clean test set. Validate `data/manifest.json`
  against the schema.
- Deploy the apps: `azd up` (provision + `deploy.ps1` ingest/index) and/or run both apps locally.
- Verify functionality against the test data: image/URL/crop search returns results, facets filter,
  no-strong-match guidance works, and the public/internal response boundaries hold.
- Verify the generic (neutral) skin renders correctly on BOTH the internal and public sites
  (brand text, theme tokens, titles) with no leftover customer-specific content.
- Record the baseline (what was deployed, dataset used, screenshots/notes) as the reference point.
- **CHECKPOINT 1:** user confirms the baseline works and the generic skin is correct.

### Phase 2 — MCP + skills scaffold
- `.vscode/mcp.json`: register `playwright` only (keyless, no secrets).
- `.github/skills/customer-onboarding/SKILL.md` — orchestrator: interview (site URL, image
  types/categories, count per category, public/internal split, metadata fields, fidelity level,
  enrich yes/no), enforce legal guardrails, sequence sub-skills, drive the deploy/iterate loop.
- `.github/skills/scrape-branding/SKILL.md` — Playwright MCP screenshots + node-vibrant palette ->
  theme tokens; computed styles -> fonts; og:image/favicon/header `<img>` -> logo; write brand + theme
  into both `public/config.js`. Surfaces the palette/fonts/logo as **inputs the AI uses to edit the CSS**
  (colors/fonts) and **swap the logo** — not a rigid logo/font slot system.
- `.github/skills/build-catalog/SKILL.md` — interview/propose metadata fields; Playwright MCP to
  navigate + identify product pages/images; run the Crawlee scraper for bulk download + info; write
  manifest + sidecars; validate uniqueness / required fields / Unicode.
- `.github/skills/reskin/SKILL.md` — apply/iterate the visual skin: base palette + hero copy via
  `config.js`, then **AI-directed CSS edits** (`styles.css` colors/fonts/spacing) and a **logo swap**
  (drop into `public/`, replace the header wordmark with an `<img>`); rebuild, verify locally, then the
  deploy-test-refine loop.
- `.github/skills/adapt-layout/SKILL.md` — OPTIONAL, riskier, do-LAST skill that edits real React code
  so the demo *flows* like the customer's site (layout/structure/navigation). Gated behind committed
  branding+catalog+skin; reverts via git if it destabilizes the demo.
- Onboarding practice: user-gated stages, and **commit after every approved stage** with a descriptive
  message so each stable point is an easy git rollback target.
- Update `.github/copilot-instructions.md` with a "Personalization / onboarding" subsection.
- `tools/onboarding/CONTRACT.md` — pin the Phase 3 script names/flags and the `catalog.json` /
  `branding.json` shapes + palette→token mapping, so the skills-first order can't drift from Phase 3.
- **CHECKPOINT 2:** user reads the 4 SKILL.md files, `mcp.json`, `CONTRACT.md`, and copilot-instructions changes.

### Phase 3 — Onboarding scraper + scripts (Node, keyless OSS)
- `tools/onboarding/` Node package (own `package.json`; deps: crawlee, playwright, node-vibrant):
  - `scrape-catalog.mjs --url <site> [--map <urls.json>] --out catalog.json` — Crawlee+Playwright crawl
    to discover product pages, extract info + image URLs; respects robots.txt; rate-limited.
  - `download-catalog.mjs --input catalog.json` — download images -> `data/images/<category>/`,
    write/merge `data/manifest.json`, write `.metadata.json` sidecars. Idempotent, schema-validated.
  - `extract-branding.mjs --url <site> --out branding.json` — screenshot + node-vibrant palette +
    computed fonts + logo URL.
  - `apply-branding.mjs --input branding.json` — **optional** fast first pass: map palette -> theme
    tokens + brand text in both `public/config.js` (preserving apiBaseUrl). Deeper fidelity (fonts,
    logo swap, spacing) is done by the AI editing `styles.css` + `public/` directly, per `reskin`.
  - Revert is a git operation (`git restore` / `git clean`) — no bundled reset script.
- `tools/onboarding/README.md` — catalog.json + branding.json shapes, invocation, idempotency,
  robots.txt/rate-limit behavior, Node/Playwright install (`npx playwright install`).
- **CHECKPOINT 3:** user runs the scripts against a test site and verifies output.

### Phase 4 — Branding fidelity via AI-directed CSS + logo swap (RETIRED the rigid token/slot approach)
Because this is a **Copilot-directed** flow and the **fork is the committed deliverable** (we also adapt
layout anyway), branding beyond the base palette is done by the **AI editing the fork's code directly**,
not by a rigid runtime contract. **Do NOT build** the `BrandConfig.logoUrl?/fontUrl?` slots, the
`--font-brand`/`--font-body` token machinery, or an `App.tsx` logo-slot — that ceremony is retired.
- **Colors / fonts / spacing:** the AI edits `styles.css` in each app directly — retune the existing
  `:root` CSS color vars, swap the font stacks (add an `@font-face` / `@import` for the real web font),
  adjust spacing. No token-mapping table to maintain.
- **Logo:** the AI drops the customer logo into each app's `public/` and swaps the header wordmark
  `<span>` for an `<img>` — one small per-skin code edit, no generic slot.
- **`config.js` stays minimal:** `apiBaseUrl` (required; stamped at provision) plus optional brand
  **text** (name/hero copy, already wired). The existing runtime theme-token override stays as-is
  (works today, harmless) — it is **not** extended.
- **Script roles shift:** `extract-branding.mjs` becomes **recon** that hands the AI the palette, fonts,
  and logo URL as *inputs* to its CSS edits; `apply-branding.mjs` is **optional** for a fast first color
  pass. Neither is a required rigid token-writer.
- **Baseline hygiene:** these CSS edits + the logo file + the committed skin live in the **fork** (the
  handoff artifact). The baseline stays generic; during baseline testing the logo/CSS edits are
  reverted via git (logo under a gitignored path or a remote URL). Trade-off: editing CSS means a
  **rebuild to preview** each change (vs. runtime config reload) — fine in a fork-committed flow.
- **CHECKPOINT 4:** user reviews the reskinned apps — colors, fonts, and logo render correctly, both
  apps build, and the neutral baseline is unchanged. (Branding fidelity now lives in the `reskin` and
  `adapt-layout` skills; there is no separate slot/token feature to ship.)

### Phase 5 — Flexible metadata / manifest (v1, LOCKED)
- Relax the manifest schema: add an optional `attributes` object (string map) for extra scraped fields,
  keeping required assetId/imagePath/category/public and the existing generic facets. `attributes` is
  passthrough metadata (captions / internal detail), NOT auto-generated facets. Keep Unicode rules.
- Map scraped product data into the existing generic facets; extras go to `attributes` or caption/tags.
  No index/indexer/UI changes. Note (docs only) that a true new facet is a manual, out-of-scope extension.
- **CHECKPOINT 5:** user reviews the schema change; ingestion/search still validates.

### Phase 6 — Docs + legal guardrails
- `docs/personalize.md` — prerequisites (Node, `npx playwright install`, Playwright MCP, azd/Azure),
  the Copilot conversation walk-through, the iterate/deploy loop, troubleshooting, revert.
- README "Personalize this demo for a customer" section linking to it.
- Legal/ethical guardrails (own section + baked into the orchestrator skill): demo-only, respect
  robots.txt/ToS, images belong to their owners, "not affiliated" disclaimer stays in the public app,
  remove/replace before any non-demo use. Orchestrator surfaces this before scraping; the scraper
  honors robots.txt and rate limits by default.
- **CHECKPOINT 6:** user reads the docs + guardrails end-to-end.

### Phase 7 — Final acceptance test: push, fork, build a real customer demo
- Pre-flight: build both apps; run frontend-ux-contract + unit tests (green); schema-validate a
  dry-run catalog; confirm the **baseline** has no secrets or customer data committed (the
  customer-artifact guard passes on `main`) — customer data is expected only in forks.
- Push the finished repo to GitHub.
- Fork it into a clean, separate location (a new user with no prior context).
- From a cold start, follow ONLY `docs/personalize.md`: install prereqs, enable Playwright MCP, open
  Copilot, and ask it to personalize the demo for a specific real customer (e.g. tailwindtoys.com).
- Verify: branding -> both config.js skinned; catalog -> data/images + valid manifest; both apps build;
  optional `azd up` renders the customer-branded internal + public sites and verify-sites.ps1 passes.
  **Time the run — it must be quick.**
- **Hand off:** in the fork, commit the personalization (branding + catalog + skin + logo) and push,
  so the customer clones a fully-personalized starting point. This commit is expected and correct — it
  lives in the fork, never in the baseline.
- **CHECKPOINT 7 (final):** user confirms the fork-to-demo experience is fast, clear, and correct.

## Relevant files
- `.vscode/mcp.json` (new, playwright only); `.github/skills/{customer-onboarding,scrape-branding,build-catalog,reskin,adapt-layout}/SKILL.md` (new); `tools/onboarding/CONTRACT.md` (new, script/JSON interface spec)
- `.github/copilot-instructions.md` (edit)
- `tools/onboarding/*.mjs` + package.json + README (new)
- `data/manifest.schema.json` (relax), `data/README.md` (edit)
- `src/apps/{internal,public}/src/branding.ts` (logo+font), `.../src/App.tsx` (logo slot), `.../src/styles.css` (font vars), `.../public/config.js` (comment new keys)
- `docs/personalize.md` (new), `README.md` (edit)
- Reuse unchanged: `src/hooks/{deploy,configure-sites,deploy-demo-data,configure-search,enrich-metadata}.ps1`

## Key considerations
1. Facet dynamism LOCKED to v1 — fixed generic facets + `attributes` passthrough. Adding a true new
   facet stays a documented, out-of-scope manual extension.
2. New deps: `tools/onboarding` adds crawlee + playwright + node-vibrant (all OSS, isolated
   package.json; requires `npx playwright install` for browser binaries). Kept out of the app packages.
3. Font fidelity: opt-in web fonts add a `<link>` + license considerations. Start with color + wordmark
   + logo; add fonts only if the demoer wants a closer match.
4. Legal: scraping third-party sites for a demo — guardrails + "not affiliated" disclaimer are
   mandatory; the scraper honors robots.txt and rate limits.
