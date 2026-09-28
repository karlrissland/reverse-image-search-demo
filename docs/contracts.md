# Vision Search contracts

Authoritative data and API contracts for the POC. Grounded in [architecture-requirements.md](../architecture-requirements.md) and the confirmed capability gate ([capability-gate.md](capability-gate.md)): Vision multimodal embeddings, model `2023-04-15`, 1024 dimensions. Runtime Search configuration/querying uses API `2026-04-01` for the validated keyless `AIServicesByIdentity` binding.

Invariants:

- One logical Search document per image asset. `assetId` is the key.
- Image binaries live only in Blob Storage. Search stores the vector and metadata, never the binary.
- The public response never exposes internal scores, provenance, raw blob paths, or model/version fields.
- Unicode (for example `rosé`) is preserved end to end. ASCII-only conversion is allowed solely where an Azure HTTP header requires it.

## Sidecar manifest → Search document

The sidecar manifest ([../data/manifest.json](../data/manifest.json), schema [../data/manifest.schema.json](../data/manifest.schema.json)) is the metadata source of record. The indexer/skillset projects each manifest entry plus the generated embedding into one Search document.

| Search field | Type | Attributes | Source | Exposure |
|---|---|---|---|---|
| `assetId` | `Edm.String` | key, filterable, retrievable | manifest `assetId` | public + internal |
| `blobPath` | `Edm.String` | retrievable | manifest `imagePath` / `metadata_storage_path` | internal only |
| `imageVector` | `Collection(Edm.Single)` | searchable, dimensions 1024, HNSW cosine | VectorizeSkill output | neither (not retrievable) |
| `caption` | `Edm.String` | searchable, retrievable | manifest `caption` | public + internal |
| `tags` | `Collection(Edm.String)` | searchable, filterable, facetable, retrievable | manifest `tags` | public + internal |
| `category` | `Edm.String` | searchable, filterable, facetable, retrievable | manifest `category` | public + internal |
| `subcategory` | `Edm.String` | searchable, filterable, facetable, retrievable | manifest `subcategory` | public + internal |
| `collection` | `Edm.String` | searchable, filterable, facetable, retrievable | manifest `collection` | public + internal |
| `color` | `Edm.String` | searchable, filterable, facetable, retrievable | manifest `color` | public + internal |
| `season` | `Edm.String` | searchable, filterable, facetable, retrievable | manifest `season` | public + internal |
| `celebrity` | `Edm.String` | filterable, facetable, retrievable | manifest `celebrity` | internal only |
| `celebritySource` | `Edm.String` | retrievable | manifest `celebritySource` | internal only (provenance) |
| `public` | `Edm.Boolean` | filterable, retrievable | manifest `public` | internal only (publish state) |
| `metadataVersion` | `Edm.String` | retrievable | ingestion constant | internal only (provenance) |
| `embeddingModelVersion` | `Edm.String` | retrievable | `2023-04-15` | internal only (provenance) |
| `indexedAt` | `Edm.DateTimeOffset` | retrievable, sortable | indexer run time | internal only (provenance) |

Facetable fields (internal faceting UI): `tags`, `category`, `subcategory`, `collection`, `color`, `season`, `celebrity`.

Publish state: the public site filters `public eq true`; the internal site sees all assets regardless of `public`.

Celebrity recognition (requirement 13): `celebrity` names the paid model when known; `celebritySource` records how that attribution was derived and is internal-only provenance.

### Index definition (Phase 5 lifts this verbatim)

```json
{
  "name": "vision-assets",
  "fields": [
    { "name": "assetId", "type": "Edm.String", "key": true, "filterable": true, "retrievable": true, "searchable": false, "sortable": false, "facetable": false },
    { "name": "blobPath", "type": "Edm.String", "retrievable": true, "searchable": false, "filterable": false, "facetable": false, "sortable": false },
    { "name": "imageVector", "type": "Collection(Edm.Single)", "searchable": true, "retrievable": false, "dimensions": 1024, "vectorSearchProfile": "vs-hnsw-cosine" },
    { "name": "caption", "type": "Edm.String", "searchable": true, "retrievable": true, "filterable": false, "facetable": false },
    { "name": "tags", "type": "Collection(Edm.String)", "searchable": true, "filterable": true, "facetable": true, "retrievable": true },
    { "name": "category", "type": "Edm.String", "searchable": true, "filterable": true, "facetable": true, "retrievable": true },
    { "name": "subcategory", "type": "Edm.String", "filterable": true, "facetable": true, "retrievable": true, "searchable": true },
    { "name": "collection", "type": "Edm.String", "filterable": true, "facetable": true, "retrievable": true, "searchable": true },
    { "name": "color", "type": "Edm.String", "filterable": true, "facetable": true, "retrievable": true, "searchable": true },
    { "name": "season", "type": "Edm.String", "filterable": true, "facetable": true, "retrievable": true, "searchable": true },
    { "name": "celebrity", "type": "Edm.String", "filterable": true, "facetable": true, "retrievable": true, "searchable": false },
    { "name": "celebritySource", "type": "Edm.String", "retrievable": true, "searchable": false, "filterable": false, "facetable": false },
    { "name": "public", "type": "Edm.Boolean", "filterable": true, "retrievable": true, "facetable": false },
    { "name": "metadataVersion", "type": "Edm.String", "retrievable": true, "searchable": false },
    { "name": "embeddingModelVersion", "type": "Edm.String", "retrievable": true, "searchable": false },
    { "name": "indexedAt", "type": "Edm.DateTimeOffset", "retrievable": true, "sortable": true }
  ],
  "vectorSearch": {
    "algorithms": [
      { "name": "alg-hnsw", "kind": "hnsw", "hnswParameters": { "metric": "cosine", "m": 4, "efConstruction": 400, "efSearch": 500 } }
    ],
    "profiles": [
      { "name": "vs-hnsw-cosine", "algorithm": "alg-hnsw" }
    ]
  },
  "semantic": {
    "defaultConfiguration": "vision-semantic",
    "configurations": [{
      "name": "vision-semantic",
      "prioritizedFields": {
        "titleField": { "fieldName": "caption" },
        "prioritizedContentFields": [],
        "prioritizedKeywordsFields": [
          { "fieldName": "tags" },
          { "fieldName": "category" },
          { "fieldName": "subcategory" },
          { "fieldName": "collection" },
          { "fieldName": "color" },
          { "fieldName": "season" }
        ]
      }
    }]
  }
}
```

## Query contract

`POST /api/search` on the .NET 10 isolated Function API.

The API generates the query embedding with the same Vision model/version (`2023-04-15`) used at indexing, then runs a k-nearest vector query against `imageVector`. With reranking enabled, Search retrieves 40 candidates by default (or the requested `top` when it is larger), applies the deterministic second pass described below, and returns exactly the requested `top` when enough candidates exist. Every Azure Search request sends both vector `k` and final `top` explicitly. Candidate retrieval uses the expanded candidate count; the lightweight facet request uses the requested `top`, so candidate expansion cannot enlarge its returned document window. Azure Search computes facet counts over the filtered matching set, independently of that returned window. Hybrid visual-score binding uses `top` equal to the number of candidate asset IDs being scored.

Request — at most one image source is accepted. Text-only search is limited to one
unambiguous full celebrity name currently present in the live index allowlist. Other
text-only requests are rejected because `matchState` and public suppression require
a defensible visual signal:

| Field | Type | Notes |
|---|---|---|
| `imageUrl` | string | Public image URL to embed. |
| `image` | binary | Uploaded image bytes (`multipart/form-data` or raw `application/octet-stream` / `image/*`). Raw-binary requests carry optional text in the UTF-8 URL-encoded `textQuery` query parameter. |
| `crop` | binary | Client-side rectangle/polygon crop bytes (POC crop search). |
| `textQuery` | string | Optional Unicode text refinement, trimmed/collapsed and limited to 500 characters by default. It may be used alone only for an indexed full celebrity name. |
| `top` | int | Result count, default 10. |
| `filters` | object | Optional OData equality/`any` filters over `category`, `color`, `season`, `collection`, `subcategory`, `tags`, and (internal only) `celebrity`. |

The public endpoint always applies `public eq true` server-side and ignores any `celebrity` filter.

### Celebrity metadata intent

The current Search index is the only celebrity allowlist source. The API reads
distinct non-empty `celebrity` facet values and never uses a separate config/file.
Text matches require one complete case/Unicode-normalized canonical name; partial,
unknown, and ambiguous multi-name phrases fall back or are rejected when text-only.
An exact intent executes metadata retrieval with escaped
`celebrity eq '<canonical value>'`, normal filters, and bounded `top` without a vector
query. See [celebrity-search.md](celebrity-search.md).

Internal image/crop/URL requests may use the existing AAD-authenticated multimodal
chat deployment when `CELEBRITY_IMAGE_RECOGNITION_ENABLED=true`. The prompt contains
only the live index-derived allowlist and requires one canonical value or `none`.
Output is strictly parsed, independently checked against the allowlist, and rejected
below `CELEBRITY_RECOGNITION_MIN_CONFIDENCE` (default `0.85`). Failure, timeout,
empty allowlist, `none`, malformed/non-allowlisted output, and low confidence fall
back to the existing visual/hybrid behavior. Full-image vector similarity is never
used as celebrity identity detection.

Public image recognition is disabled. Public text intent derives its allowlist from
the same live index with `public eq true`, then forces `public eq true` again during
retrieval. A celebrity present only on private assets is therefore not detectable
through the public text-only path. Public responses expose neither celebrity metadata
nor recognition/model/filter diagnostics.

JSON reads `textQuery` independently of `filters`; absent, `null`, empty, and
whitespace-only values normalize to no text signal. Multipart requests reject zero
or multiple image sources unless the zero-image request carries a text query; the
API then accepts it only if one full allowlisted celebrity name is detected.
Combinations of `crop`, `image`, and `imageUrl` remain invalid. Raw-binary requests
use their body as the single image source and may
send text as `?textQuery=<UTF-8 percent-encoded value>`; this is backward-compatible
with existing raw uploads that omit the parameter.

### Hybrid, semantic, and query-image enrichment contract

The three query features are independently configured and disabled by default:

| Setting | Default | Behavior |
|---|---:|---|
| `HYBRID_TEXT_ENABLED` | `false` | When true and a user/generated text signal exists, sends one Search request containing the image vector plus `search` over `caption`, `tags`, `category`, `subcategory`, `collection`, `color`, and `season`. With false, or without text, the prior vector-only payload and request count are preserved. |
| `SEMANTIC_RANKING_ENABLED` | `false` | Adds `queryType=semantic` and `semanticConfiguration=vision-semantic` only to an active hybrid request. It has no effect without hybrid text. |
| `QUERY_IMAGE_ENRICHMENT_ENABLED` | `false` | When hybrid is enabled, sends the query image to the already-provisioned, AAD-authenticated `gpt-4o` deployment and requires strict caption/tag JSON. When explicitly enabled, any enrichment failure fails the request; vector-only behavior occurs only when enrichment is disabled (or hybrid retrieval itself is disabled). |
| `CELEBRITY_IMAGE_RECOGNITION_ENABLED` | `false` | Internal-only allowlist-constrained query-image recognition before normal retrieval. |
| `CELEBRITY_RECOGNITION_MIN_CONFIDENCE` | `0.85` | Minimum accepted constrained recognition confidence. |

User text and generated caption/tags are combined into ephemeral query text. Query interpretation is returned only by `/api/search/internal`; it is never stored in the index or sidecars and is distinct from corpus `enrichmentModel` provenance. `/api/search` accepts the same public-safe `textQuery` but returns no query interpretation.

Hybrid Search scores are reciprocal-rank-fusion values and semantic scores are reranker diagnostics; neither replaces visual similarity. For hybrid requests the API exact-vector-scores every returned candidate. `matchState` uses the strongest raw visual score successfully bound by asset ID across that candidate set, while internal `score` retains each candidate's raw visual similarity and final display order remains hybrid/semantic plus the deterministic metadata reranker. Missing or unbound visual scores do not qualify a request; if none bind, the result is `noStrongMatch`.

Latency/cost shape: with all three flags disabled, there is no additional model call and the existing vector request pattern is unchanged. An active hybrid request uses three Search data-plane calls when candidate expansion is enabled (hybrid candidates, stable facets, and candidate visual scoring). Semantic ranking consumes the Search service's semantic quota but adds no separate HTTP call. Query-image enrichment adds one gpt-4o vision chat-completions call and is expected to dominate incremental latency and token cost; it therefore defaults off. No live latency or token measurements were available in the isolated issue worktree, so operators must measure the deployed environment before enabling these flags broadly.

### Second-pass reranking

`IResultReranker` isolates ordering from retrieval. The default `MetadataConsensusReranker` uses the highest raw-similarity candidate as an anchor and adds small, bounded ordering adjustments for exact category, subcategory, and collection agreement plus tag-set overlap. It does not inspect captions, infer image contents, call another model, or replace the raw Vision similarity score. `RERANKING_CANDIDATE_COUNT` defaults to `40` and is guarded to `30` through `50`. Set `RERANKING_ENABLED=false` to restore direct vector ordering and retrieve only the requested `top`; another implementation can replace the registered interface without changing the Function contract.

Reranking runs only when the highest raw Vision similarity reaches `NO_STRONG_MATCH_THRESHOLD`. Weak or out-of-domain queries keep raw vector order. For vector-only retrieval, the leading raw vector score qualifies the query. For hybrid retrieval, the strongest successfully bound candidate visual score qualifies it independently of hybrid/semantic order. Internal `score` remains the unmodified visual score, so metadata adjustments cannot turn a weak query into a strong match. See [reranking-prototype.md](reranking-prototype.md) for validation and production caveats.

### Response — public

```json
{
  "matchState": "matches",
  "results": [
    {
      "assetId": "womens-014",
      "imageUrl": "https://<account>.blob.core.windows.net/images/Women/014.jpg?<short-lived-SAS>",
      "caption": "…",
      "tags": ["…"],
      "category": "womens",
      "subcategory": "…",
      "collection": "…",
      "color": "rosé",
      "season": "…"
    }
  ],
  "facets": { "category": [], "color": [], "season": [], "collection": [], "tags": [] }
}
```

Public results carry a short-lived SAS URL and never include `score`, `celebrity`, `celebritySource`, `public`, `blobPath`, or any `*Version`/`indexedAt` provenance.

The API compares the vector-only leader, or the strongest successfully bound hybrid candidate visual score, with the configurable `NO_STRONG_MATCH_THRESHOLD`, which defaults to `0.78`. `matchState` is either `matches` or `noStrongMatch` and is safe for both clients because it exposes neither the raw score nor the threshold. When the public response is `noStrongMatch`, `results` and `facets` are empty so weak nearest neighbors cannot be presented as successful matches.

### Response — internal

Internal responses use the same `matchState` but retain all nearest neighbors and facets when it is `noStrongMatch`. The internal UI shows explicit guidance first and places those weak results under an expandable diagnostic affordance.

Internal results add, per item: `score` (relative nearest-neighbor similarity), `confidence` (legacy API-derived percentage), `celebrity`, `celebritySource`, `public`, `blobPath`, `metadataVersion`, `embeddingModelVersion`, and `indexedAt`. The internal site labels `score * 100` as **Similarity**, explains that it is not calibrated confidence, and preserves the raw score in provenance for diagnostic review. It also classifies results as **Strong** (`score >= 0.85`), **Fair** (`0.78 <= score < 0.85`), or **Weak** (`score < 0.78`) using named frontend constants. The public site displays neither score field, quality band, threshold, nor provenance.

Hybrid internal diagnostics additionally expose `hybridScore`, `semanticRerankerScore`, and top-level `queryInterpretation`. These fields are absent from the public TypeScript and JSON contracts.

`queryInterpretation` is explicitly shaped with camel-case JSON fields:
`userText`, `generatedCaption`, `generatedTags`, `effectiveText`, `hybridApplied`,
`semanticApplied`, `enrichmentApplied`, and `enrichmentModelVersion`. The public
response omits the object entirely.

Celebrity diagnostics extend the internal object with `celebrityName`,
`celebrityIntentSource`, `celebrityFilter`, `celebrityRecognitionAttempted`,
`celebrityRecognitionConfidence`, `celebrityRecognitionModelVersion`, and
`celebrityFallbackReason`. Raw prompts/model output are never returned.
The internal **Reasoning** disclosure uses request-specific prose for uploaded
images, image URLs, selected crop areas, text-only metadata searches, and
image-plus-text refinement. It mentions hybrid, enrichment, semantic, and
celebrity signals only when the returned diagnostics say they were used or
relevant. Celebrity outcomes are recognized from the approved list, attempted
without an approved match, or safely unavailable. When recognition does not
produce a metadata match, the panel describes the retrieval that actually
continued: visual-only, hybrid image-and-text, or text-only. Raw fallback codes,
confidence, filters, model versions, and unused `Not Applied`/`Not Generated`
rows are not shown in that primary panel.

## Existing-index migration

Azure AI Search cannot change an existing field from non-searchable to searchable.
The hybrid schema requires `subcategory`, `collection`, `color`, and `season` to be
searchable. `configure-search.ps1` therefore reads the deployed index before applying
the definition. A compatible index remains an idempotent create/update. Immutable
field differences fail fast with the exact differences and do not issue an opaque
update request.

For the disposable 200-image POC, a maintainer may explicitly approve and run:

```powershell
.\src\hooks\configure-search.ps1 -Reset
```

`-Reset` deletes and recreates the indexer, skillset, data source, and index, then
reindexes the authoritative private Blob data. It must not be used against a
production-scale index without an approved migration. The production recommendation
is a versioned index plus alias/blue-green cutover after reindexing and validation.
