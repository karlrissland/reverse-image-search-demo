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
5. **Fidelity level** — text+palette only, or also logo/fonts (logo/fonts land in Phase 4).
6. **AI enrichment** yes/no (reuse `src/hooks/enrich-metadata.ps1` for gpt-4o sidecars).

## Sequence (each stage is user-gated — the user drives how the demo materializes)
Work one stage at a time. After each stage, SHOW the user what changed, get explicit approval, adjust
on request, then re-confirm before moving on. Never chain stages without a confirmation.
**Commit after every approved stage** with a descriptive message (e.g.
`onboarding(branding): apply Tailwind Toys palette + hero copy`) — each commit is a known-good rollback
point. Work on a throwaway branch so the whole run is easy to unwind.

1. **Branding** → run the `scrape-branding` skill → produces `branding.json` and skins both `config.js`.
   - **Checkpoint:** show the palette, fonts, logo, and `brand.*` copy (ideally preview a running app).
     Adjust anything the user flags, re-apply, and re-confirm. On approval, **commit** before continuing.
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
