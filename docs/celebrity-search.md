# Allowlist-constrained celebrity search

Issue #33 implements celebrity **intent detection followed by metadata retrieval**.
It does not use whole-image vector similarity as identity detection and does not make
open-ended identity claims.

## Source of truth

The API loads the allowlist on each relevant request from the current
`vision-assets` index:

```json
{
  "search": "*",
  "top": 0,
  "filter": "celebrity ne null and celebrity ne ''",
  "facets": ["celebrity,count:100"],
  "select": "assetId"
}
```

Empty facet values are discarded. Search configuration validates that `celebrity`
is filterable, facetable, and retrievable, and runs a read-only facet readiness query
after an idempotent update or indexer run. There is no separate allowlist setting or
file. One logical Search document remains one image asset, and Search contains no
image binary.

Internal requests use the full current-index facet set. Public text requests add
`public eq true` to the facet query so a text-only response cannot reveal that a
celebrity exists only in private/internal metadata.

## Intent and retrieval

- Text is Unicode compatibility-normalized and matched only when one complete
  allowlisted name occurs with Unicode letter/mark/number boundaries. Combining
  marks are continuations, not separators, so an allowlisted `राम` cannot match
  inside `रामा`. Case differences, composed/decomposed accents, repeated spaces,
  punctuation, and typographic apostrophes are accepted. Partial, unknown, or
  multiple-name phrases are not treated as a celebrity intent.
- A matched name becomes an escaped exact filter such as
  `celebrity eq 'Lupita Nyong''o'`.
- Metadata retrieval uses `search: "*"`, the exact celebrity filter, normal request
  filters, and the bounded request `top` (1-50). It sends no vector query and returns
  every matching document in that bounded window.
- If there is no text match, an internal image/crop/URL request may use the existing
  managed-identity, vision-capable chat deployment when
  `CELEBRITY_IMAGE_RECOGNITION_ENABLED=true`.
- The model receives only the current index-derived allowlist. It must return strict
  JSON containing exactly one canonical name or `none` plus confidence. The API
  independently revalidates the name and requires
  `CELEBRITY_RECOGNITION_MIN_CONFIDENCE` (default `0.85`).
- Empty allowlists, timeouts, model failures, `none`, malformed output,
  non-allowlisted names, and low confidence never produce a guess. Image requests
  fall back to the unchanged visual/hybrid path.

## Public/internal boundary

Image celebrity recognition and its diagnostics are internal-only. Internal responses
show the canonical name, `text` or `image` source, escaped metadata filter, confidence,
model version, and a safe fallback reason. Prompts and raw model output are never
returned.

Text celebrity intent is safe on the public API only for names represented by a
public asset: its allowlist view is filtered by `public eq true`, retrieval forces
`public eq true` again, and the response omits `celebrity`, provenance,
recognition/filter diagnostics, scores, and model information. The current
evaluation celebrity assets are `public: false`, so their names are not detectable
through the public text-only path and they do not appear publicly.

## POC limitations and production requirements

- Model recognition is probabilistic and can be wrong despite an allowlist and
  confidence threshold. It is disabled by default and must not be represented as
  biometric verification or a definitive identity claim.
- Use only rights-cleared query images and trusted, contractually approved celebrity
  metadata. Define retention, consent, regional biometric/privacy review, audit,
  abuse monitoring, and human review before production use.
- The POC facet cap is 100 names and request result cap is 50. Production should add
  explicit paging, a short bounded cache with index-version invalidation, telemetry,
  rate limits, evaluation by demographic and image-quality slices, and a documented
  false-positive/false-negative policy.
- Do not persist query images, recognition output, or prompts unless a separately
  approved privacy and retention design requires it.
