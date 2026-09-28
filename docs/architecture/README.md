# Vision Search — Architecture Diagrams

Interactive architecture documentation for the Vision Search POC, generated with the
`archify` skill at the `showcase` quality profile. Each diagram is a standalone,
self-contained HTML file.

Use the [rendered GitHub Pages gallery](https://karlrissland.github.io/visionsearch/architecture/)
for browser-ready diagrams. The links below also use the rendered Pages route. Maintainers
can use the source links to inspect or rebuild the committed Archify specs.

GitHub Pages is not active until a repository administrator selects **GitHub Actions** as
the Pages source and the publish workflow completes successfully. Before that first
deployment, rendered links may return 404. This repository is private, so the owning
account or organization must also have a plan that supports Pages for private repositories.

Every diagram ships in two variants:

- **Static** — the full diagram with view toggles and cards.
- **Motion** — the same diagram with an animated trace that walks the primary path.

The set is organized into three sections, each covered by the same five diagram types:
**architecture** (topology), **workflow** (phased steps), **sequence** (message timeline),
**data flow** (lineage), and **lifecycle** (state machine).

The source specs live in [specs/](specs/) and are re-buildable with the archify CLI.

---

## 1 · Application Deployment

How `azd up` provisions Azure and ships the Function API and both React sites.

| # | Diagram | Static | Motion | Source specs |
|---|---------|--------|--------|--------------|
| 01 | Architecture — Azure topology | [open](https://karlrissland.github.io/visionsearch/architecture/01-deployment-architecture.html) | [trace](https://karlrissland.github.io/visionsearch/architecture/01-deployment-architecture.motion.html) | [static](specs/01-deployment-architecture.json) · [motion](specs/01-deployment-architecture.motion.json) |
| 02 | Workflow — azd lifecycle | [open](https://karlrissland.github.io/visionsearch/architecture/02-deployment-workflow.html) | [trace](https://karlrissland.github.io/visionsearch/architecture/02-deployment-workflow.motion.html) | [static](specs/02-deployment-workflow.json) · [motion](specs/02-deployment-workflow.motion.json) |
| 03 | Sequence — azd up call order | [open](https://karlrissland.github.io/visionsearch/architecture/03-deployment-sequence.html) | [trace](https://karlrissland.github.io/visionsearch/architecture/03-deployment-sequence.motion.html) | [static](specs/03-deployment-sequence.json) · [motion](specs/03-deployment-sequence.motion.json) |
| 04 | Data flow — artifact & config lineage | [open](https://karlrissland.github.io/visionsearch/architecture/04-deployment-dataflow.html) | [trace](https://karlrissland.github.io/visionsearch/architecture/04-deployment-dataflow.motion.html) | [static](specs/04-deployment-dataflow.json) · [motion](specs/04-deployment-dataflow.motion.json) |
| 05 | Lifecycle — deployment states | [open](https://karlrissland.github.io/visionsearch/architecture/05-deployment-lifecycle.html) | [trace](https://karlrissland.github.io/visionsearch/architecture/05-deployment-lifecycle.motion.html) | [static](specs/05-deployment-lifecycle.json) · [motion](specs/05-deployment-lifecycle.motion.json) |

---

## 2 · Image & Metadata Ingestion + Search Index Creation

How images and metadata land in Blob and how the Azure AI Search index is built and vectorized.

| # | Diagram | Static | Motion | Source specs |
|---|---------|--------|--------|--------------|
| 06 | Architecture — AI Search topology | [open](https://karlrissland.github.io/visionsearch/architecture/06-ingestion-architecture.html) | [trace](https://karlrissland.github.io/visionsearch/architecture/06-ingestion-architecture.motion.html) | [static](specs/06-ingestion-architecture.json) · [motion](specs/06-ingestion-architecture.motion.json) |
| 07 | Workflow — build pipeline | [open](https://karlrissland.github.io/visionsearch/architecture/07-ingestion-workflow.html) | [trace](https://karlrissland.github.io/visionsearch/architecture/07-ingestion-workflow.motion.html) | [static](specs/07-ingestion-workflow.json) · [motion](specs/07-ingestion-workflow.motion.json) |
| 08 | Sequence — indexer run | [open](https://karlrissland.github.io/visionsearch/architecture/08-ingestion-sequence.html) | [trace](https://karlrissland.github.io/visionsearch/architecture/08-ingestion-sequence.motion.html) | [static](specs/08-ingestion-sequence.json) · [motion](specs/08-ingestion-sequence.motion.json) |
| 09 | Data flow — asset lineage | [open](https://karlrissland.github.io/visionsearch/architecture/09-ingestion-dataflow.html) | [trace](https://karlrissland.github.io/visionsearch/architecture/09-ingestion-dataflow.motion.html) | [static](specs/09-ingestion-dataflow.json) · [motion](specs/09-ingestion-dataflow.motion.json) |
| 10 | Lifecycle — indexer run states | [open](https://karlrissland.github.io/visionsearch/architecture/10-ingestion-lifecycle.html) | [trace](https://karlrissland.github.io/visionsearch/architecture/10-ingestion-lifecycle.motion.html) | [static](specs/10-ingestion-lifecycle.json) · [motion](specs/10-ingestion-lifecycle.motion.json) |

---

## 3 · Internal App (Runtime Search)

How the internal React app runs an image search end to end through the Function API.

| # | Diagram | Static | Motion | Source specs |
|---|---------|--------|--------|--------------|
| 11 | Architecture — runtime search topology | [open](https://karlrissland.github.io/visionsearch/architecture/11-internal-architecture.html) | [trace](https://karlrissland.github.io/visionsearch/architecture/11-internal-architecture.motion.html) | [static](specs/11-internal-architecture.json) · [motion](specs/11-internal-architecture.motion.json) |
| 12 | Workflow — search request | [open](https://karlrissland.github.io/visionsearch/architecture/12-internal-workflow.html) | [trace](https://karlrissland.github.io/visionsearch/architecture/12-internal-workflow.motion.html) | [static](specs/12-internal-workflow.json) · [motion](specs/12-internal-workflow.motion.json) |
| 13 | Sequence — runtime search | [open](https://karlrissland.github.io/visionsearch/architecture/13-internal-sequence.html) | [trace](https://karlrissland.github.io/visionsearch/architecture/13-internal-sequence.motion.html) | [static](specs/13-internal-sequence.json) · [motion](specs/13-internal-sequence.motion.json) |
| 14 | Data flow — query & response | [open](https://karlrissland.github.io/visionsearch/architecture/14-internal-dataflow.html) | [trace](https://karlrissland.github.io/visionsearch/architecture/14-internal-dataflow.motion.html) | [static](specs/14-internal-dataflow.json) · [motion](specs/14-internal-dataflow.motion.json) |
| 15 | Lifecycle — search UI states | [open](https://karlrissland.github.io/visionsearch/architecture/15-internal-lifecycle.html) | [trace](https://karlrissland.github.io/visionsearch/architecture/15-internal-lifecycle.motion.html) | [static](specs/15-internal-lifecycle.json) · [motion](specs/15-internal-lifecycle.motion.json) |

---

## Rebuilding a diagram

Each diagram is authored as a JSON spec under [specs/](specs/) and validated before delivery.

```powershell
# validate one spec at showcase quality
node .github/skills/archify/bin/archify.mjs validate <type> docs/architecture/specs/<NN-name>.json --quality showcase --json

# deliver both the static and motion HTML variants
powershell -ExecutionPolicy Bypass -File docs/architecture/specs/_deliver.ps1 -Type <type> -Name <NN-name>
```

`<type>` is one of `architecture`, `workflow`, `sequence`, `dataflow`, or `lifecycle`.

## Publishing the gallery

The [Publish architecture gallery](../../.github/workflows/publish-architecture-pages.yml)
workflow runs after a push to `main` changes the workflow or a top-level
`docs/architecture/*.html` file. It can also be run manually. The build job stages only
the gallery landing page and committed HTML artifacts under `_site/architecture`, verifies
that every top-level HTML source was copied, and uploads the supported GitHub Pages
artifact. A separate least-privilege deploy job publishes that artifact.

One-time repository setup:

1. Open **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. After this workflow reaches `main`, run **Publish architecture gallery** manually if
   the merge push did not already start it.
4. Confirm the deployment environment reports
   `https://karlrissland.github.io/visionsearch/`, then verify the
   [gallery route](https://karlrissland.github.io/visionsearch/architecture/) and at
   least one static and motion diagram.

If the Pages setting is unavailable, a repository administrator must first confirm that
the account plan supports Pages for this private repository. Do not treat the expected URL
as live until the deployment succeeds.

When diagrams change, rebuild and commit the Archify spec and HTML artifacts together.
Merging those HTML changes to `main` triggers a new Pages deployment. The workflow does
not regenerate diagrams.

> These diagrams describe the POC as built. POC shortcuts are called out on each diagram's
> cards alongside the keyless, managed-identity production posture.
