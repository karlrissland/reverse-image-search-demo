---
name: customer-onboarding
description: Use when a user wants to personalize/skin this Vision Search demo for a specific company or website — e.g. "personalize this demo for TailwindToys.com", "make this look like <brand>", "onboard a customer", "reskin and load <site>'s catalog". Orchestrates branding + catalog + reskin sub-skills, enforces legal guardrails, and drives the deploy/iterate loop.
---

# Customer onboarding (orchestrator)

Turn the neutral baseline demo into a customer-specific demo from a single website URL. You interview
the user, enforce guardrails, then sequence the sub-skills and drive the deploy/iterate loop.

## Prerequisites (check first, help install if missing)
- Node 20+ and the onboarding package under `tools/onboarding/` (`npm install` there). *(Built in Phase 3.)*
- Playwright MCP server enabled (registered in `.vscode/mcp.json`) and browsers installed
  (`npx playwright install`).
- Azure access for the optional deploy step (`azd`, `DefaultAzureCredential`).
- A working neutral baseline (Phase 1). If unsure, confirm both apps build and the sample skin renders.

## Legal & ethical guardrails — surface these BEFORE any scraping
State this to the user and get acknowledgement:
- **Demo use only.** Scraped images and text belong to their owners; this is a short-lived demo, not a
  redistribution or a product.
- **Respect `robots.txt` and site ToS.** The scraper honors `robots.txt` and rate-limits by default;
  do not override those without the site owner's permission.
- **Keep the "not affiliated" disclaimer** in the public app's footer for any customer skin.
- **Remove/replace** the customer's data and branding before any non-demo use. Never commit customer
  images or private data to a shared branch.

## Interview (ask, then confirm a short plan)
1. Target **site URL**.
2. **Image categories** to feature (e.g. Costumes, Accessories) and rough **count per category**.
3. **Public/internal split** — which items appear on the public site vs internal only.
4. **Metadata fields** that matter for facets/captions (map onto the generic facets; extras → attributes).
5. **Fidelity level** — text+palette via `config.js` only, or also logo + fonts (done as AI-directed CSS
   edits + a logo swap in `reskin`, not a config slot).
6. **AI enrichment** yes/no (reuse `src/hooks/enrich-metadata.ps1` for gpt-4o sidecars).

## Sequence (each stage is user-gated — the user drives how the demo materializes)
Work one stage at a time. After each stage, SHOW the user what changed, get explicit approval, adjust
on request, then re-confirm before moving on. Never chain stages without a confirmation.
**Commit after every approved stage** with a descriptive message (e.g.
`onboarding(branding): apply Tailwind Toys palette + hero copy`) — each commit is a known-good rollback
point. Work on a throwaway branch so the whole run is easy to unwind.

1. **Branding** → run the `scrape-branding` skill → produces `branding.json` and skins both `config.js`.
   - **Checkpoint (side-by-side diff):** approve the **running app against a screenshot of the live
     site**, not `branding.json` swatches in isolation — isolated swatch review hides a wrong theme.
     First confirm the palette is **grounded in the site's computed styles** (not a screenshot-derived
     dominant color or a brand stereotype like "Halloween → dark"); see the `scrape-branding` grounding
     step. Adjust anything the user flags, re-apply, and re-confirm. On approval, **commit** before continuing.
2. **Catalog** → run the `build-catalog` skill → discovers products, downloads images, writes
   `data/manifest.json` + sidecars.
   - **Checkpoint:** review the proposed `catalog.json` BEFORE downloading (categories, public/internal
     split, counts, metadata), then spot-check the imported results. Adjust and re-run as needed.
     On approval, **commit** before continuing.
3. **Reskin / iterate** → run the `reskin` skill to refine copy/palette locally.
   - **Checkpoint:** iterate until the look is right — this loop is theirs to drive. On approval,
     **commit** before continuing.
4. **Deploy (optional)** → only after the user OKs it: `azd up` (or `azd provision` if infra exists)
   runs `deploy.ps1` ingest/index → `verify-sites.ps1`. See the `azure-deployment` skill for gotchas.
   - **Checkpoint:** confirm the deployed customer sites look right and search works.
5. **Final verify** → image/URL/crop search returns results, facets filter, public/internal boundary
   holds, customer skin renders on both sites, disclaimer present on public. Confirm, then **commit**
   this known-good demo state.
6. **Adapt layout / flow (optional, LAST, riskier)** → only if the user wants the demo to *flow* like
   their site, run the `adapt-layout` skill. It edits real React code, so it goes last, on top of a
   committed good state. Each successful change is verified and committed individually; a failed attempt
   is reverted to the last good commit, never piled on. If flow work can't be stabilized, revert and
   ship without it — the branding + catalog + skin demo already stands on its own.

## Fallback when scraping is blocked (don't stall the demo)
The onboarding scripts make extraction accurate and precise, but they are an accelerator, not a hard
requirement. They already drive a **real Edge/Chrome browser headed by default**, so watch the window
and click through any bot challenge that appears. If a site still fights back (aggressive bot
protection, JS-only rendering, login walls) and a tool times out or returns mostly defaults, escalate:
- **Escalate to the MCP browser first.** Open the site in the keyless **Playwright MCP** browser
  (Edge, `.vscode/mcp.json`) and drive it interactively so the human clears the challenge, then read
  branding/URLs/images directly. Only drop to approximation if even that can't reach the site.
- **Branding:** ask the user for screenshots (homepage, a category page, header/footer) and eyeball
  the palette, fonts, logo, and copy into `branding.json`. See the `scrape-branding` fallback section.
- **Catalog:** read products off screenshots, and where the real images/copy are blocked, use image
  generation to synthesize representative stand-in images and draft descriptions/metadata. Mark them
  as generated in the sidecar `attributes`. See the `build-catalog` fallback section.
- Always tell the user which parts are approximated vs scraped, keep the not-affiliated disclaimer,
  and invite corrections at each checkpoint. A close-enough demo built from a couple of screenshots is
  a valid outcome — more real data just raises the fidelity.

## Contracts & scripts
All script names, flags, and the `catalog.json` / `branding.json` shapes are pinned in
[`tools/onboarding/CONTRACT.md`](../../../tools/onboarding/CONTRACT.md). Use those exact commands.
*(The scripts themselves are implemented in Phase 3; until then, describe the step and reference the
contract rather than inventing a different interface.)*

## Revert / undo (use git)
There is no custom reset script — personalization edits files in place, so undo is a git operation, and
because every approved stage is committed, rolling back to a stable point is easy:
- Find the stage to return to: `git log --oneline`; preview with `git status` / `git diff`.
- Roll back to the last good stage: `git reset --hard <commit>` (or `git checkout .` / `git restore .`
  to drop only the current stage's uncommitted, in-progress edits).
- Remove newly downloaded, uncommitted images/sidecars: `git clean -nd` to preview, then `git clean -fd`.
- Recommend a throwaway branch so the entire run can be discarded at once.

## Stop conditions
- If `robots.txt` disallows the target, or the user can't confirm demo-only use → stop and explain.
- If the baseline isn't healthy → fix that first (don't skin on top of a broken demo).
