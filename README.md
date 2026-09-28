# Vision Search

Azure-native reverse image search proof of concept for a fashion-retail digital asset discovery demo.

The solution keeps image binaries in private Azure Blob Storage, indexes image vectors and metadata in Azure AI Search, generates multimodal embeddings with Azure Vision, and exposes search through a .NET isolated Azure Function. Two React/Vite frontends demonstrate the experience: an internal diagnostic image-library app and a public-style shopping/search surface.

## What this repo contains

| Area | Path | Purpose |
|---|---|---|
| Infrastructure | [`infra/`](infra/) | Subscription-scope Bicep for Blob Storage, Azure AI Search, AI Services, Function App, Static Web Apps, monitoring, RBAC, and Azure Load Testing. |
| API | [`src/api/`](src/api/) | .NET 10 isolated Function with `POST /api/search` and `POST /api/search/internal`. |
| Internal UX | [`src/apps/internal/`](src/apps/internal/) | Diagnostic search app with upload, image URL, crop search, facets, similarity bands, no-strong-match guidance, and provenance. |
| Public UX | [`src/apps/public/`](src/apps/public/) | Public-safe shopping-style surface with upload, image URL, crop search, facets, and no internal scores/provenance. |
| Data | [`data/`](data/) | Demo manifest, 200-image corpus plus four non-public evaluation assets, schema, technical Unicode fixture, and generated metadata sidecars. |
| Hooks | [`src/hooks/`](src/hooks/) | `azd` lifecycle scripts for site config stamping, data upload, Search configuration, and load-test setup. |
| Load tests | [`src/loadtest/`](src/loadtest/) | Locust-based API/site test harness for Azure Load Testing. |
| Documentation | [`docs/`](docs/) | Contracts, capability gate evidence, implementation status, reranking notes, and Archify diagrams. |

## Current architecture

The POC has three main runtime paths:

1. **Provision and deploy:** `azd` provisions Azure resources from Bicep, stamps the Function API origin into both SPA configs, and deploys the API plus both Static Web Apps.
2. **Ingest and index:** image assets and trusted metadata are uploaded to private Blob Storage; Azure AI Search indexer and Vision VectorizeSkill create one searchable document per image with a 1024-dimensional vector.
3. **Search at runtime:** users submit an uploaded image, crop, or image URL; the Function generates a query embedding, searches Azure AI Search, optionally reranks qualified candidates, mints short-lived Blob SAS URLs, and returns either public-safe or internal diagnostic fields.

Celebrity intent is a separate metadata path. The allowlist comes from current
non-empty `celebrity` facets in Search. A complete allowlisted text name—or an
internal, explicitly enabled, allowlist-constrained image recognition—runs an exact
celebrity metadata filter without vector identity detection. See
[`docs/celebrity-search.md`](docs/celebrity-search.md).

Key design invariants:

- Image binaries stay in Blob Storage only.
- Azure AI Search stores metadata and vectors, not image binaries.
- Public responses never expose raw scores, provenance, blob paths, celebrity metadata, or model/version fields.
- Internal responses include diagnostics such as raw similarity, match quality, provenance, and indexing metadata.
- Unicode metadata such as `rosé` is preserved end to end.

## Architecture gallery

The architecture gallery is generated with the [`archify`](.github/skills/archify/SKILL.md) skill at showcase quality. Each diagram is a standalone HTML artifact. Most diagrams have both a static version and a motion trace version. Open the [rendered gallery](https://karlrissland.github.io/visionsearch/architecture/) for browser-ready diagrams. Maintainers can use the [gallery source and deployment guide](docs/architecture/README.md) and [source specs](docs/architecture/specs/).

GitHub Pages must be enabled with **Source: GitHub Actions** before the rendered links become available. Until the first successful deployment, the Pages URLs may return 404.

### Application Deployment

How `azd up` provisions Azure and ships the Function API and both React sites.

| # | Diagram | Static | Motion |
|---|---|---|---|
| 01 | Azure topology | [open](https://karlrissland.github.io/visionsearch/architecture/01-deployment-architecture.html) | [trace](https://karlrissland.github.io/visionsearch/architecture/01-deployment-architecture.motion.html) |
| 02 | azd lifecycle workflow | [open](https://karlrissland.github.io/visionsearch/architecture/02-deployment-workflow.html) | [trace](https://karlrissland.github.io/visionsearch/architecture/02-deployment-workflow.motion.html) |
| 03 | azd up call sequence | [open](https://karlrissland.github.io/visionsearch/architecture/03-deployment-sequence.html) | [trace](https://karlrissland.github.io/visionsearch/architecture/03-deployment-sequence.motion.html) |
| 04 | Artifact and config data flow | [open](https://karlrissland.github.io/visionsearch/architecture/04-deployment-dataflow.html) | [trace](https://karlrissland.github.io/visionsearch/architecture/04-deployment-dataflow.motion.html) |
| 05 | Deployment lifecycle states | [open](https://karlrissland.github.io/visionsearch/architecture/05-deployment-lifecycle.html) | [trace](https://karlrissland.github.io/visionsearch/architecture/05-deployment-lifecycle.motion.html) |

### Image and Metadata Ingestion + Search Index Creation

How images and metadata land in Blob Storage and how the Azure AI Search index is built and vectorized.

| # | Diagram | Static | Motion |
|---|---|---|---|
| 06 | AI Search topology | [open](https://karlrissland.github.io/visionsearch/architecture/06-ingestion-architecture.html) | [trace](https://karlrissland.github.io/visionsearch/architecture/06-ingestion-architecture.motion.html) |
| 07 | Ingestion workflow | [open](https://karlrissland.github.io/visionsearch/architecture/07-ingestion-workflow.html) | [trace](https://karlrissland.github.io/visionsearch/architecture/07-ingestion-workflow.motion.html) |
| 08 | Indexer run sequence | [open](https://karlrissland.github.io/visionsearch/architecture/08-ingestion-sequence.html) | [trace](https://karlrissland.github.io/visionsearch/architecture/08-ingestion-sequence.motion.html) |
| 09 | Asset lineage data flow | [open](https://karlrissland.github.io/visionsearch/architecture/09-ingestion-dataflow.html) | [trace](https://karlrissland.github.io/visionsearch/architecture/09-ingestion-dataflow.motion.html) |
| 10 | Indexer lifecycle states | [open](https://karlrissland.github.io/visionsearch/architecture/10-ingestion-lifecycle.html) | [trace](https://karlrissland.github.io/visionsearch/architecture/10-ingestion-lifecycle.motion.html) |

### Internal App Runtime Search

How the internal React app runs an image search end to end through the Function API.

| # | Diagram | Static | Motion |
|---|---|---|---|
| 11 | Runtime search topology | [open](https://karlrissland.github.io/visionsearch/architecture/11-internal-architecture.html) | [trace](https://karlrissland.github.io/visionsearch/architecture/11-internal-architecture.motion.html) |
| 12 | Search request workflow | [open](https://karlrissland.github.io/visionsearch/architecture/12-internal-workflow.html) | [trace](https://karlrissland.github.io/visionsearch/architecture/12-internal-workflow.motion.html) |
| 13 | Runtime search sequence | [open](https://karlrissland.github.io/visionsearch/architecture/13-internal-sequence.html) | [trace](https://karlrissland.github.io/visionsearch/architecture/13-internal-sequence.motion.html) |
| 14 | Query and response data flow | [open](https://karlrissland.github.io/visionsearch/architecture/14-internal-dataflow.html) | [trace](https://karlrissland.github.io/visionsearch/architecture/14-internal-dataflow.motion.html) |
| 15 | Search UI lifecycle states | [open](https://karlrissland.github.io/visionsearch/architecture/15-internal-lifecycle.html) | [trace](https://karlrissland.github.io/visionsearch/architecture/15-internal-lifecycle.motion.html) |

## Search behavior

The Function API accepts at most one image source:

- uploaded image bytes,
- uploaded crop bytes, or
- an image URL.

An image may be omitted only for one complete celebrity name currently present in
the Search-derived allowlist.

The API embeds the query image with the same Azure Vision model version used for indexing, performs exhaustive vector search for the 200-image POC corpus, expands the candidate set for qualified searches, and applies deterministic metadata-consensus reranking. Raw Vision similarity still controls `matchState`; weak or out-of-domain queries are not reranked into matches.

See:

- [`docs/contracts.md`](docs/contracts.md) for Search schema, API request/response, public/internal boundaries, facets, and match-state behavior.
- [`docs/reranking-prototype.md`](docs/reranking-prototype.md) for the candidate expansion and reranking prototype.
- [`docs/capability-gate.md`](docs/capability-gate.md) for the validated Vision VectorizeSkill capability.

## Data included in the POC

The demo corpus contains 200 catalog images under [`data/images/`](data/images/),
split evenly across:

- Home,
- Kids-Baby,
- Mens,
- Women.

Four additional non-public evaluation assets carry trusted celebrity labels for
allowlist/facet validation. They are not production identity claims or public assets.

[`data/manifest.json`](data/manifest.json) is the asset source of record. It maps each image to an `assetId`, path, category, and public flag. Generated `*.metadata.json` sidecars add caption, tags, color, season, and subcategory metadata for most assets.

## Running locally

The frontends read their API origin from `public/config.js`.

```powershell
# Internal diagnostic UX
cd src\apps\internal
npm install
npm run dev -- --host 127.0.0.1 --port 5173

# Public-style UX
cd ..\public
npm install
npm run dev -- --host 127.0.0.1 --port 5174
```

The API targets .NET 10:

```powershell
$env:DOTNET_ROOT = "$env:USERPROFILE\.dotnet"
$env:PATH = "$env:DOTNET_ROOT;$env:PATH"
dotnet build src\api\VisionSearch.Api.csproj
```

## Deploying

Use Azure Developer CLI as the lifecycle entry point:

```powershell
azd up --environment visionsearch --location eastus
```

The infrastructure is subscription-scoped Bicep. Most resources run in East US for Vision multimodal embeddings; Static Web Apps use East US 2 for the SWA control plane.

The post-provision Search step detects immutable index-field differences before
updating. Normal deployment remains idempotent for a compatible schema and fails
fast for an incompatible existing index. For the disposable 200-image POC, after
explicit maintainer approval, recreate and reindex from Blob with:

```powershell
.\src\hooks\configure-search.ps1 -Reset
```

Do not use that destructive POC migration for a production-scale corpus. Use a
versioned index, blue-green reindex, validation, and alias cutover instead.

See:

- [`azure.yaml`](azure.yaml) for service and hook wiring.
- [`infra/README.md`](infra/README.md) for infrastructure notes.
- [`src/hooks/README.md`](src/hooks/README.md) for post-provision scripts.
- [`status.md`](status.md) for phase status and known blockers.
- [`docs/implementation-status.md`](docs/implementation-status.md) for implementation history.

## Documentation map

| Document | Purpose |
|---|---|
| [`docs/README.md`](docs/README.md) | Documentation folder index. |
| [`docs/architecture/README.md`](docs/architecture/README.md) | Complete Archify architecture gallery. |
| [`docs/contracts.md`](docs/contracts.md) | Search document schema, API contract, public/internal response boundaries. |
| [`docs/capability-gate.md`](docs/capability-gate.md) | Vision VectorizeSkill validation and go/no-go decision. |
| [`docs/capability-gate.evidence.json`](docs/capability-gate.evidence.json) | Capability gate evidence. |
| [`docs/reranking-prototype.md`](docs/reranking-prototype.md) | Second-pass reranking method, validation, and limitations. |
| [`docs/implementation-status.md`](docs/implementation-status.md) | Detailed build history and current follow-up notes. |
| [`status.md`](status.md) | Phase tracker. |
| [`architecture-requirements.md`](architecture-requirements.md) | Original architecture requirements. |
| [`plan.md`](plan.md) | Approved implementation plan and work phases. |
| [`data/README.md`](data/README.md) | Data folder overview. |
| [`src/api/README.md`](src/api/README.md) | API project notes. |
| [`src/apps/internal/README.md`](src/apps/internal/README.md) | Internal UX notes. |
| [`src/apps/public/README.md`](src/apps/public/README.md) | Public UX notes. |
| [`src/loadtest/README.md`](src/loadtest/README.md) | Locust and Azure Load Testing notes. |

## Production follow-ups

This is a demo-quality POC. Production hardening should include:

- Entra authentication and stronger authorization on the internal API.
- Private networking and stricter egress controls.
- Production AEM workflow integration.
- Calibrated relevance thresholds from labeled test data.
- Load testing at representative scale.
- Monitoring, alerting, and cost governance.
- Production data-quality processes for metadata, special characters, and celebrity attribution.
