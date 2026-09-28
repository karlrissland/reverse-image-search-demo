# Query API

.NET 10 isolated Azure Function on Flex Consumption. The API accepts image uploads and URLs plus optional `textQuery`, executes validated image or hybrid image/text queries, applies filters/facets, and returns public-safe or internal result contracts with short-lived SAS URLs.

The image remains required except for a text-only query containing one unambiguous
full celebrity name from the current Search-index facet allowlist. Hybrid text
retrieval, semantic ranking, query-image caption/tag enrichment, and internal
allowlist-constrained celebrity recognition are independent settings:

- `HYBRID_TEXT_ENABLED`
- `SEMANTIC_RANKING_ENABLED`
- `QUERY_IMAGE_ENRICHMENT_ENABLED`
- `CELEBRITY_IMAGE_RECOGNITION_ENABLED` (default `false`)
- `CELEBRITY_RECOGNITION_MIN_CONFIDENCE` (default `0.85`)

See `docs/contracts.md` for the exact request, diagnostics, score-safety, and public/internal boundary.

Request modes:

- JSON: `imageUrl`, optional `textQuery`, `top`, and `filters`.
- Multipart: exactly one of `crop`, `image`, or `imageUrl`, plus optional fields.
- Raw binary: image bytes in the body; optional Unicode text is the UTF-8
  percent-encoded `textQuery` query parameter.

All Azure Search payloads explicitly align final `top` with vector `k`. Expanded
candidate retrieval, requested-top facet retrieval, and exact visual-score binding
therefore use deliberate, independently tested windows.

Hybrid/semantic order does not qualify a match. The strongest raw visual score
successfully bound across the returned candidate set owns `matchState`; missing
bindings fail closed. Final result order remains hybrid/semantic plus local reranking.
Internal `queryInterpretation` is explicitly serialized with the camel-case React
contract, while the public response omits it.

Celebrity intent performs exact escaped metadata retrieval, not vector identity
detection. The allowlist is loaded from non-empty `celebrity` facets in the current
index. Image recognition is internal-only, constrained to that list, and safely
falls back on failure/timeout/`none`/invalid/low-confidence output. See
`docs/celebrity-search.md`.
