# Status: Copilot-driven customer personalization

Tracks every step to light up the "fork → personalize → deploy a customer demo" vision.
Legend: [ ] not started · [~] in progress · [x] done · 🛑 = user checkpoint (must approve to proceed)

See [plan.md](plan.md) for full detail.

---

## Phase 0 — Trackers
- [x] Write `plan.md` (personalization plan)
- [x] Write `status.md` (this file)
- ✅ **CHECKPOINT 0** — [x] user reviewed plan.md + status.md and approved scope/approach

## Phase 1 — Establish the baseline
> Note: the repo shipped with NO baseline dataset. Assembled fresh from Fashionpedia (86 images: 42 Men, 44 Women, all .jpg).
- [x] Source test images — Fashionpedia images placed in `data/images/Men` + `data/images/Women` (86 total)
- [x] Add attribution footnotes (Fashionpedia, Archify, scraping stack) to README
- [x] Generate `data/manifest.json` (structural) via `src/scripts/build-manifest.ps1`
- [x] gpt-4o enrichment → 86 `.metadata.json` sidecars via `src/hooks/enrich-metadata.ps1` (0 failed)
- [x] Mirror descriptive fields into `data/manifest.json` via `src/scripts/merge-sidecars.ps1`
- [x] Validate `data/manifest.json` against the schema (86 unique ids, no disallowed keys, valid seasons)
- [x] Deploy the apps — `azd up` succeeded (clean create path after `azd down --purge`)
- [x] Verify search (image/URL/crop) + facets + no-strong-match + public/internal boundaries on test data
- [x] Verify the generic neutral skin renders correctly on both internal and public sites
- [x] Record the baseline (deployment + dataset + screenshots/notes) as the reference point
- ✅ **CHECKPOINT 1** — [x] user confirmed baseline works and the generic skin is correct

## Phase 2 — MCP + skills scaffold
- [x] `.vscode/mcp.json` — register `playwright` MCP (keyless)
- [x] `.github/skills/customer-onboarding/SKILL.md` — orchestrator (interview, guardrails, sequencing)
- [x] `.github/skills/scrape-branding/SKILL.md` — palette/fonts/logo → brand + theme
- [x] `.github/skills/build-catalog/SKILL.md` — metadata interview + scrape + manifest
- [x] `.github/skills/reskin/SKILL.md` — apply/iterate skin, deploy-test-refine loop
- [x] `.github/skills/adapt-layout/SKILL.md` — OPTIONAL/riskier/do-last: edit React code to flow like the site
- [x] `tools/onboarding/CONTRACT.md` — script/JSON interface appendix (anti-drift anchor for Phase 3)
- [x] `.github/copilot-instructions.md` — add Personalization/onboarding subsection
- ✅ **CHECKPOINT 2** — [x] user reviewed the 5 SKILL.md files, mcp.json, CONTRACT.md, and instructions changes — **Phase 2 complete**

## Phase 3 — Onboarding scraper + scripts (Node, keyless OSS)
- [x] `tools/onboarding/package.json` (deps: crawlee, playwright, node-vibrant, sharp, ajv)
- [x] `scrape-catalog.mjs` — discover product pages + extract info/image URLs (robots.txt, rate-limited)
- [x] `download-catalog.mjs` — download images, write/merge manifest + sidecars (idempotent, schema-validated)
- [x] `extract-branding.mjs` — screenshot + palette + fonts + logo URL → branding.json
- [x] `apply-branding.mjs` — map palette→theme (both token sets), set brand text, preserve apiBaseUrl
- [x] `lib/util.mjs` + `lib/robots.mjs` — shared helpers (args, hash, color, JSON) + robots.txt matcher
- [x] Document git-based revert (`git restore` / `git clean`) — no reset script
- [x] `tools/onboarding/README.md` + `.gitignore` — shapes, invocation, idempotency, robots.txt, playwright install
- [x] Smoke-tested offline: download-catalog (data-URL → jpg → sidecar → schema-valid manifest, idempotent) and apply-branding (both config.js skinned, apiBaseUrl preserved); baseline restored via git
- 🛑 **CHECKPOINT 3** — [ ] user runs scripts against a live test site (needs `npx playwright install chromium`) and verifies output

## Phase 4 — Branding fidelity via AI-directed CSS + logo swap (rigid token/slot approach RETIRED)
- [ ] Do NOT build logoUrl/fontUrl slots or `--font-brand`/`--font-body` token machinery (retired)
- [ ] Branding fidelity = AI edits `styles.css` (colors/fonts/spacing) + swaps the logo in `public/`, per `reskin`
- [ ] `extract-branding` = recon inputs; `apply-branding` optional (fast palette pass); `config.js` stays apiBaseUrl + brand text
- 🛑 **CHECKPOINT 4** — [ ] user reviews reskinned apps (colors/fonts/logo render, both build); neutral baseline unchanged

## Phase 5 — Flexible metadata / manifest (v1)
- [ ] Relax `data/manifest.schema.json` with optional `attributes` passthrough
- [ ] Map scraped data → existing generic facets; extras → attributes/tags; doc the manual-facet note
- 🛑 **CHECKPOINT 5** — [ ] user reviews schema change; ingestion/search still validates

## Phase 6 — Docs + legal guardrails
- [ ] `docs/personalize.md` — prerequisites, walk-through, iterate/deploy loop, troubleshooting, revert
- [ ] README "Personalize this demo for a customer" section
- [ ] Legal/ethical guardrails section + baked into orchestrator skill
- 🛑 **CHECKPOINT 6** — [ ] user reads docs + guardrails end-to-end

## Phase 7 — Final acceptance test: push, fork, build a real customer demo
- [ ] Pre-flight: build both apps; frontend-ux-contract + unit tests green; schema-validate dry-run; no secrets
- [ ] Push finished repo to GitHub
- [ ] Fork into a clean, separate location (cold-start new user)
- [ ] Follow only `docs/personalize.md`: personalize for a real customer (e.g. tailwindtoys.com)
- [ ] Verify branding + catalog + build; optional `azd up` renders customer sites; verify-sites passes; time it
- 🛑 **CHECKPOINT 7 (final)** — [ ] user confirms fork-to-demo is fast, clear, and correct = DONE
