# Vision Vectorization Capability Gate

This gate must pass before the Azure AI Search index, skillset, and indexer are finalized.

## Required evidence

- The selected Azure AI Search API version supports `#Microsoft.Skills.Vision.VectorizeSkill`.
- The selected Vision/AI Services resource and model version are supported in the target region.
- Blob image input is accepted by the indexer skill.
- The output vector dimension is 1024, or the requirements are formally revised.
- The query-time image embedding path uses the same model/version and is available to the .NET Function API.
- Authentication works with the planned managed identities and `DefaultAzureCredential` flow.
- The exact request and response payloads are captured in a repeatable probe.

## Probe configuration

Set these values after provisioning:

- `VISION_SEARCH_ENDPOINT`
- `VISION_ENDPOINT`
- `VISION_SEARCH_API_VERSION`
- `VISION_MODEL_VERSION`
- `VISION_VECTOR_DIMENSIONS`

Run:

```powershell
./src/scripts/validate-vision-capability.ps1
```

Pass `-RunRemoteProbe` to execute the live Vision embedding and Search skillset acceptance checks. The script asserts each Vision embedding is exactly 1024 dimensions and that Azure AI Search accepts a `#Microsoft.Skills.Vision.VectorizeSkill` skillset, then writes machine-readable evidence to `docs/capability-gate.evidence.json`. Do not replace the required Vision skill with a legacy image-analysis skill or a text embedding service to make the probe pass.

## Decision record

**Decision: GO** (recorded 2026-09-18). Machine-readable evidence: [capability-gate.evidence.json](capability-gate.evidence.json).

| Item | Value |
|------|-------|
| Subscription | `ME-MngEnvMCAP761185-karlriss-1` (`46201ee6-19bd-45a2-a643-045c6ed9f474`) |
| Tenant | `499b952e-2194-4661-af36-2f39f4261f76` |
| Spike region (tested) | Sweden Central (AIServices `kvr-ai-sandbox`) + East US (Free Search `vs-capspike-1b349431`) |
| Recommended deploy region | East US (full Vision feature set + Search AI-enrichment + Flex Consumption + App Service) |
| Vision API version | `2024-02-01` |
| Search API version | `2025-09-01` |
| Model version | `2023-04-15` |
| Vector dimensions | 1024 (asserted for both text and image) |
| Identity used | User principal via `DefaultAzureCredential` / AAD bearer (`az account get-access-token`, resource `https://cognitiveservices.azure.com`). Key auth is disabled tenant-wide by governance policy, so managed identity + AAD is the only supported path. |

### Request / response shapes

- Query-time text embedding: `POST {visionEndpoint}/computervision/retrieval:vectorizeText?api-version=2024-02-01&model-version=2023-04-15`, body `{"text":"..."}`, `Content-Type: application/json`. Response `{"modelVersion":"2023-04-15","vector":[... 1024 floats ...]}`.
- Query-time image embedding: `POST {visionEndpoint}/computervision/retrieval:vectorizeImage?api-version=2024-02-01&model-version=2023-04-15`, raw image bytes with `Content-Type: application/octet-stream`. Response `{"modelVersion":"2023-04-15","vector":[... 1024 floats ...]}`.
- Ingestion skillset: Azure AI Search accepts a `#Microsoft.Skills.Vision.VectorizeSkill` skillset (input `/document/metadata_storage_path`, output `image_vector`, modelVersion `2023-04-15`) at API version `2025-09-01`.

### Limitations / notes

- Cognitive Services data-plane RBAC (`Cognitive Services User`, `Microsoft.CognitiveServices/*`) took materially longer than the documented ~5 min to propagate before the first successful embedding call; budget for this when provisioning managed identities.
- The `#Microsoft.Skills.Vision.VectorizeSkill` requires a billable AI multi-service resource attached to the skillset for >20 documents/day.

A failed or unavailable capability is a design blocker, not a reason to silently change the architecture.
