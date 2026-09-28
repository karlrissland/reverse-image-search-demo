# Second-pass reranking prototype

## Method

The API retrieves up to 40 vector candidates by default, bounded to 30 through 50 by `RERANKING_CANDIDATE_COUNT`, before returning the requested `top`. If `top` is greater than the configured candidate count, it retrieves `top` candidates. Azure AI Search still owns vector scoring, filtering, and facet counts. When candidate expansion is active, a parallel lightweight query computes facets with the requested raw `top`, preserving the pre-reranking facet meaning instead of counting the larger candidate pool.

`MetadataConsensusReranker` is a deterministic second pass behind `IResultReranker`. For queries whose highest raw Vision similarity is at least `NO_STRONG_MATCH_THRESHOLD`, it keeps the raw similarity as the primary signal and adds small ordering adjustments for metadata agreement with the highest-similarity candidate:

| Signal | Maximum adjustment |
|---|---:|
| Same category | 0.012 |
| Same subcategory | 0.010 |
| Same collection | 0.006 |
| Tag Jaccard overlap | 0.008 |

The highest vector candidate remains the anchor. Ties retain original vector order. Internal `score` and `confidence` remain derived from the raw Azure AI Search score, not the adjusted ordering value.

Weak queries are not reranked. `matchState` is calculated from the pre-rerank top similarity, so metadata cannot promote an out-of-domain query to `matches`. Public `noStrongMatch` responses remain empty.

## Disable or swap

- Set `RERANKING_ENABLED=false` to retrieve only the requested `top` and preserve raw vector order.
- Set `RERANKING_CANDIDATE_COUNT` from 30 through 50 to tune the candidate pool.
- Replace the `IResultReranker` registration in `Program.cs` to test another strategy without changing retrieval, response shaping, or the public contract.

## Validation images and evidence

Validation uses:

- In-domain: `data/images/Home/001.jpg`.
- Out-of-domain: a generated 800 by 500 PNG containing only a blue sky, green geometric hills, and a yellow sun. It is stored as a local validation artifact and is not part of the product corpus.

Before deployment, the in-domain query returned `home-001` first at `0.99985`; the remaining raw top ten were all Home assets. The synthetic landscape returned `noStrongMatch` with a top raw similarity near `0.75`. The public in-domain response exposed only the documented public fields.

After deployment, `home-001` remained first at the same raw score. Among close results, bedding-set assets `home-015` and `home-014` moved ahead of less metadata-consistent neighbors while every returned score stayed unchanged. The synthetic landscape retained the same ten-item raw order and `noStrongMatch`, confirming that weak queries bypass reranking. Requests for `top=1`, `top=5`, `top=10`, and `top=50` returned exactly those counts. Facet output for the in-domain `top=10` query matched the pre-rerank response, and the public response contained no internal fields. Single post-deployment calls completed in about 1.39 seconds for the in-domain query and 0.55 seconds for the synthetic landscape, but these are smoke observations rather than a controlled latency benchmark.

## Limitations and production recommendation

This prototype assumes that the best vector hit is a useful metadata anchor. Incorrect or sparse metadata can reduce the value of the adjustment, and cohort agreement is not proof that an image is semantically relevant. The method deliberately avoids caption-to-image comparison because the request contains no trustworthy text signal. It also avoids an additional vision-capable model call, which would add cost, latency, availability, and prompt-governance concerns.

Retrieving 40 candidates instead of 10 increases Search response size and local sorting work. Preserving facet semantics also uses a parallel lightweight Search query when reranking is active. The local sort is negligible at this bound, but the extra request and expanded response must be measured under representative load. At production catalog scale, evaluate learned or multimodal reranking offline with labeled relevance judgments, preserve the raw embedding score for qualification, calibrate thresholds per model and corpus, and use feature flags plus A/B measurement before rollout.
