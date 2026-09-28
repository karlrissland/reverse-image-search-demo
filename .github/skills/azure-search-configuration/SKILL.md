---
name: azure-search-configuration
description: Use when creating or changing the Azure AI Search index, data source, Vision skillset, indexer, vector configuration, query contract, or Search readiness checks for this repository.
---

# Azure AI Search Configuration

Use the validated `#Microsoft.Skills.Vision.VectorizeSkill` contract from the capability spike. Preserve one logical asset document per image, a 1024-dimensional vector when supported, HNSW cosine configuration, filterable/facetable metadata, and indexer diagnostics. Never substitute OpenAI text embeddings or legacy image analysis without an explicit approved plan change. Keep configuration idempotent and test Unicode, facets, vector dimensions, and no-binary storage invariants.
