# Vision Search Repository Instructions

## Project

This repository contains an Azure-native image-search POC. Keep image binaries in private Blob Storage. Azure AI Search stores one logical document per image asset, including metadata, facets, and the validated multimodal image vector. The .NET 10 isolated Azure Function is the query API. The internal and public-style React/Vite/TypeScript sites deploy as separate Azure App Service apps.

## Working rules

- Read `plan.md` and the relevant requirements before changing architecture.
- Treat `#Microsoft.Skills.Vision.VectorizeSkill` validation as a hard gate. Never silently replace it with legacy Image Analysis or text embeddings.
- Use managed identities and `DefaultAzureCredential` where possible. Never commit keys, tokens, SAS URLs, or private customer data.
- Preserve Unicode in JSON, Search fields, APIs, and UI. ASCII-only conversion is allowed only where an Azure HTTP header requires it.
- Keep Search documents free of image binaries.
- Keep public API responses separate from internal metadata, provenance, and diagnostics.
- Prefer idempotent scripts and explicit readiness checks.
- Use PowerShell for Windows deployment orchestration and keep scripts parameterized.
- Use Azure Load Testing with parameterized Locust scripts for performance validation.
- Keep POC shortcuts documented beside production recommendations.

## Validation

Run focused tests after each change. For infrastructure, validate Bicep and `azd` configuration before deployment. For .NET, use `dotnet build` and `dotnet test`. For frontend apps, use the package manager scripts in the app. For Search/data changes, run manifest validation and indexer/query checks. Do not claim capability support until the capability spike has evidence.

## Personalization / customer onboarding

This repo can be forked and personalized to demo Vision Search for a specific company or website. When a user asks to personalize, skin, or onboard a customer (e.g. "make this look like `<site>`", "load `<site>`'s catalog"):

- Start with the `customer-onboarding` orchestrator skill; it interviews the user, enforces guardrails, and sequences the `scrape-branding`, `build-catalog`, and `reskin` skills. Each stage is user-gated, and every approved stage is committed with a descriptive message so any stable point is an easy git rollback target. `adapt-layout` (editing React code so the demo *flows* like the customer's site) is optional, riskier, and runs LAST on top of a committed good state — reverting via git if it destabilizes the demo.
- Surface the legal/ethical guardrails **before** any scraping: demo-only, respect `robots.txt`/ToS, images belong to their owners, keep the public "not affiliated" disclaimer, and remove customer data before non-demo use. Never commit customer images or private data to a shared branch.
- If `robots.txt` or ToS disallows scraping the target, **don't silently stop and don't silently override** — ask the user whether to continue and proceed only if they **explicitly accept responsibility**. Basing styling or catalog data off a screenshot is a last-resort fallback that requires this user permission.
- Browser automation uses the keyless **Playwright MCP** server (`.vscode/mcp.json`). Catalog/branding work runs the Node scripts in `tools/onboarding/` whose interface is pinned in `tools/onboarding/CONTRACT.md`.
- The scrapers make extraction accurate but aren't required. If a site blocks them (bot protection, JS-only, login walls), fall back to **approximation**: ask the user for screenshots to eyeball branding, and use image generation for stand-in catalog images/descriptions (mark generated items in the sidecar `attributes`). Always say what's approximated vs scraped and keep the "not affiliated" disclaimer.
- Skinning is runtime via `window.__VISIONSEARCH__` (`brand` + `theme`) in each app's `public/config.js`; the two apps use different theme token names (see the contract's mapping table). Keep the generic facets fixed in v1 — extra scraped fields go to sidecar `attributes`, not new index facets.


