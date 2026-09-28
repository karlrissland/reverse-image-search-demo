# Deployment Hooks

`azd` lifecycle hooks and PowerShell orchestration. `azd` is the orchestrator: it
provisions infrastructure and deploys the three services (api, internal, public)
natively via the `services:` block in `azure.yaml`. These hook scripts run the
post-provision steps that depend on provisioned infrastructure (not on app
deployment):

- `deploy.ps1` — `postprovision` orchestrator; fans out to the child scripts below.
- `configure-sites.ps1` — stamp the Function API origin (`AZURE_FUNCTION_URI`) into each SPA's `public/config.js`.
- `deploy-demo-data.ps1` — manifest-driven upload of the demo image dataset to Blob Storage.
- `configure-search.ps1` — create or update the Azure AI Search index, Blob data
  source, Vision skillset, and indexer, then run the indexer and poll readiness.
  Compatible definitions update idempotently. Immutable field differences fail
  before any PUT and require explicit maintainer approval to run `-Reset`, which
  deletes and recreates the disposable POC objects before reindexing. Production
  migrations should instead build and validate a versioned index, then switch an
  alias (blue-green cutover).
- `configure-loadtest.ps1` — create/update the Locust test in Azure Load Testing (idempotent; `-Run` to start a run).

AAD/managed identity only — no keys, no SAS. Normal compatible updates are
idempotent and safe to re-run; `configure-search.ps1 -Reset` is intentionally
destructive and is never selected by the post-provision orchestrator.

## Known improvements (POC shortcuts)

- **Blob metadata stamping is slow.** `deploy-demo-data.ps1` stamps manifest/sidecar
  fields onto each blob with one `az storage blob metadata update` call per image. This
  does **not** hit any AI model (Vision embeddings run inside the Search indexer; gpt-4o
  runs only in the decoupled `enrich-metadata.ps1`) — the cost is the per-blob `az` CLI
  process spawn (a Python wrapper that re-resolves the Entra token each call), which
  serializes across ~200 blobs. Production fix: batch via the Storage data-plane SDK, or
  parallelize with `ForEach-Object -Parallel`.

- **SPA API origin is stamped into `config.js` at post-provision.** The internal and public
  sites read their API base URL at runtime from `public/config.js`
  (`window.__VISIONSEARCH__.apiBaseUrl`). Shipped empty, each SPA POSTs to its own Static
  Web App origin (`/api/search`), which the static host rejects with **HTTP 405** (it only
  serves GET/HEAD). `configure-sites.ps1` writes `AZURE_FUNCTION_URI` into both files during
  `postprovision`, before `azd` builds the SPAs, so the value flows into `dist/config.js`.
  Static Web App **application settings do not help here** — they surface only to the
  managed/linked Functions backend, never to the static client assets, so they cannot inject
  the API URL into the browser bundle. The stamp self-heals on every `azd up`/provision, but
  a bare `azd deploy` (no provision) will not re-run the hook, so a Function hostname change
  without a re-provision leaves a stale URL. Production fix: link the Function App to each
  Static Web App as a **linked backend** (requires the SWA **Standard** plan) so `/api/*`
  proxies same-origin and `apiBaseUrl` can stay empty — no URL stamping at all.
