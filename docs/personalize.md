# Personalize this demo for a customer

Turn this generic Vision Search demo into a **customer-flavored** one — the customer's branding
(colors, fonts, logo, copy) on both sites and their product catalog behind the search — by talking to
**GitHub Copilot**. The heavy lifting is Copilot-directed: it runs keyless open-source scrapers for the
data, then edits the app code to match the look.

> **Demo only.** This produces a *representative* demo, not an affiliated or production site. Keep the
> "not affiliated" disclaimer on the public app and respect the source site's `robots.txt` / terms.
> See [Legal & ethical guardrails](#legal--ethical-guardrails).

---

## The model: baseline vs. fork

- **This repo is the baseline/template.** It stays generic. Customer-specific bytes (branding values,
  logos, catalog images, skinned `config.js`, CSS edits) must **never** be committed to it.
- **A fork is where personalization happens.** You fork the repo, let Copilot customize it in place,
  commit, and push — so the customer clones a **fully-personalized starting point**. Customer data *is*
  meant to be versioned, just in the **fork**, never in the baseline.

So the flow is: **fork → personalize (Copilot) → review → deploy → commit & push the fork → hand off.**

---

## Prerequisites

- **Node 20+** and the onboarding package deps: `cd tools/onboarding && npm install`.
- A **real browser** for the scrapers. They drive Microsoft **Edge** (or Chrome) headed by default;
  if neither is installed, `npx playwright install chromium` provides a fallback.
- **Playwright MCP** enabled in VS Code (registered in [`.vscode/mcp.json`](../.vscode/mcp.json), keyless)
  — Copilot uses it as an interactive browser for recon and for clearing bot challenges.
- **azd + an Azure subscription** if you want to deploy (`azd up`). Local preview (`npm run dev`) needs
  no Azure.
- **git** — personalization edits are applied in place and reverted/handed off via git.

---

## Quick start (Copilot-driven)

1. **Fork** this repo and open your fork in VS Code.
2. Open **Copilot Chat** and ask, for example:
   > "Personalize this demo for spirithalloween.com."
3. Copilot invokes the **`customer-onboarding`** orchestrator skill, which interviews you (site,
   categories, counts, public/internal split, fidelity, enrich yes/no), surfaces the guardrails, and
   sequences the sub-skills below — **each stage is user-gated and committed on approval**.
4. **Review** at each checkpoint, preview locally, and when happy **deploy** and/or **commit & push**
   the fork.

You can also drive the sub-skills directly ("pull spirithalloween's branding", "load their catalog",
"the accent is too dark").

---

## What Copilot does, stage by stage

### 1. Branding (skill: `scrape-branding` → `reskin`)
- **Recon** — `extract-branding.mjs --url <site> --out branding.json` opens the homepage in a real
  browser and captures the **palette** (node-vibrant), **fonts**, **logo URL**, brand **copy**, and a
  `navLinks` list of candidate category URLs. These are **inputs**, not a rigid contract.
- **Apply the base skin** — palette + brand text go into each app's `public/config.js`
  (`window.__VISIONSEARCH__`), a runtime skin you can edit and reload with no rebuild.
  `apply-branding.mjs --input branding.json` does this in one pass (optional; small tweaks are just
  editing `config.js`).
- **Match the look (AI-directed)** — for logo and fonts and any deeper color/spacing fidelity, Copilot
  **edits the app code directly**: it swaps the customer **logo** into each app's `public/` and replaces
  the header wordmark with an `<img>`, and adjusts **fonts/colors/spacing** in `styles.css` (adding an
  `@font-face`/`@import` for a real web font). This is more flexible than a fixed token set and needs a
  rebuild to preview.

### 2. Catalog (skill: `build-catalog`)
- **Discover + extract** — give Copilot the customer's **category/listing URLs** (from `navLinks` or
  the site nav) and it runs
  `scrape-catalog.mjs --category-urls "<u1>,<u2>" --out catalog.json`. The scraper loads each listing
  in a real browser, scrolls to trigger lazy images, and harvests each product tile's **URL + image +
  title** — no deep product-page navigation (which retail sites often bot-block).
- **Review** `catalog.json` (categories, public/internal split, counts) before downloading.
- **Download + write** — `download-catalog.mjs --input catalog.json` fetches images into
  `data/images/<Category>/`, writes/merges `data/manifest.json` and per-image `.metadata.json`
  sidecars, and schema-validates. Extra scraped fields (sku, price…) land in sidecar **`attributes`**
  (passthrough only — not auto-faceted).
- **(Optional) enrich** — `src/hooks/enrich-metadata.ps1` adds gpt-4o captions/tags.

### 3. Deploy & iterate
- **Preview locally** — `npm run dev` in `src/apps/public` and `src/apps/internal`.
- **Deploy** — `azd up` provisions Azure, uploads images to Blob, builds the Search index, and ships
  both sites; `verify-sites.ps1` runs as a post-deploy check. (Catalog images only appear in search
  results once deployed — results come from the Azure API, not local dev.)
- **Refine** — iterate branding/copy with Copilot; redeploy as needed.

### 4. (Optional, last) Adapt layout (skill: `adapt-layout`)
Only after branding + catalog + skin are confirmed and committed: Copilot can edit the React code so
the demo **flows** like the customer's site (layout, navigation, component arrangement). This is
riskier (real code changes) — do it last, on top of a committed good state, and revert via git if it
destabilizes the demo.

---

## Hand off the fork

When the demo looks right, in the **fork**:

```powershell
git add -A
git commit -m "personalize: <customer> branding + catalog"
git push
```

The customer clones the fork and has a fully-personalized starting point. This commit is expected and
correct — it lives in the **fork**, never in the baseline.

---

## Legal & ethical guardrails

- **Demo only.** Not an affiliated, endorsed, or production site. Keep the public **"not affiliated"**
  disclaimer in the public app's footer.
- **Respect the source.** The scrapers honor **`robots.txt`** and rate-limit by default. Respect the
  site's terms of service. Images and trademarks belong to their owners.
- **Don't leak customer data into the baseline.** Do personalization in a **fork**. Never commit
  customer images, logos, or private data to the shared baseline repo.
- **Remove/replace before any non-demo use.** Verify image licenses before anything beyond a demo.

---

## Troubleshooting

- **Bot-protected site (timeouts / `ERR_HTTP2_PROTOCOL_ERROR` / blank pages).** The scrapers already
  run a real Edge headed so you can click through challenges. If it's still blocked: open the site in
  the **Playwright MCP** browser and navigate interactively, then feed Copilot the category URLs. If
  even that fails, **approximate**: give Copilot screenshots for the branding and use image generation
  for stand-in catalog images (mark generated items in the sidecar `attributes`).
- **Only the homepage loads, deep links time out.** That's detail-page bot mitigation — expected. The
  catalog scraper harvests from the **listing page** on purpose, so you still get products.
- **Customer font doesn't show.** A font only renders if it's a real web font. Make sure Copilot added
  an `@font-face`/`@import` (e.g. a Google Fonts link) in `styles.css`, not just a family name.
- **Logo doesn't load remotely.** Some logos are hotlink-protected. Have Copilot download it into each
  app's `public/` and reference the local path instead of the remote URL.
- **Search returns nothing locally.** Results come from the deployed Azure API — run `azd up` and let
  ingestion/indexing finish. Local `npm run dev` shows branding, not live search results.

---

## Revert (undo a personalization)

Personalization edits files in place, so undo is a **git** operation — no reset script:

```powershell
git restore .                      # discard tracked edits (config.js, styles.css, manifest, …)
git clean -nd                      # preview untracked additions (downloaded images, logo, catalog.json)
git clean -fd                      # remove them
```

Intermediate artifacts (`branding.json`, `catalog.json`, `*-home.png`, `.playwright-mcp/`) are
gitignored. Running personalization on a throwaway branch makes revert trivial.

---

## Reference

- Orchestrator + sub-skills: [`.github/skills/`](../.github/skills/) —
  `customer-onboarding`, `scrape-branding`, `build-catalog`, `reskin`, `adapt-layout`.
- Script interface (names, flags, JSON shapes): [`tools/onboarding/CONTRACT.md`](../tools/onboarding/CONTRACT.md).
- Scraper package: [`tools/onboarding/README.md`](../tools/onboarding/README.md).
