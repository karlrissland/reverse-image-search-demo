# Architecture requirements:
1. Use Azure Blob Storage as the source of image binaries. Do not store image binaries in Azure AI Search.
2. Use Azure AI Search indexer-based ingestion for the POC.
3. Configure an Azure AI Search skillset using the built-in Azure Vision multimodal embeddings skill:
   @odata.type = #Microsoft.Skills.Vision.VectorizeSkill
4. Use Azure Vision multimodal embeddings modelVersion 2023-04-15 unless a newer generally available version is available.
5. Store the generated image embedding in a vector field in Azure AI Search.
6. Store extracted metadata text in searchable text fields in the same Azure AI Search document.
7. Store structured metadata as filterable/facetable fields in the same Azure AI Search document.
8. Use one Azure AI Search document per image asset.
9. Include a query path that accepts either an uploaded image or image URL, generates a query embedding using the same Azure Vision multimodal embedding model/version, and runs a vector query against Azure AI Search.
10. Return top-K similar images with asset ID, blob path/URL, similarity score, caption/tags/metadata, and any matching facets.

# Implementation details:
- Define the Azure AI Search index schema, including:
  - assetId: key field
  - blobPath or blobUri: retrievable field
  - imageVector: Collection(Edm.Single), searchable vector field, 1024 dimensions
  - caption or description: searchable text field
  - tags: searchable/filterable/facetable collection field
  - category, color, season, collection, brand, sku or styleId: filterable/facetable fields where applicable
  - metadataVersion, embeddingModelVersion, indexedAt fields
- Configure vector search using HNSW with cosine similarity.
- Configure the Blob Storage data source and indexer.
- Configure the skillset to vectorize image input or image URLs using Azure Vision multimodal embeddings.
- Map the skill output vector into the imageVector field.
- Include sample metadata extraction from blob path, sidecar JSON files, CSV metadata, or existing blob metadata. If no metadata source exists, create simple placeholder metadata derived from file path/name.
- Provide a small sample dataset and a repeatable script or IaC template to deploy the required Azure resources.
- Provide a simple test client or API endpoint for querying by image URL/file.
- Include instructions for running the prototype locally and validating the results.

# Deliverables:
1. Bicep for infrastructure as code
2. Azure AI Search index definition.
3. Azure AI Search data source definition.
4. Azure AI Search skillset definition using Azure Vision multimodal embeddings.
5. Azure AI Search indexer definition.
6. Use Azure Developer CLI for deployment and management of the resources.
7. Sample metadata mapping.
8. Query script/API that generates a query embedding and performs vector search.
9. Two demo websites, one mimicking an internal image library and one mimicking a public storefront.
10. README with deployment steps, configuration values, and validation steps.
11. Document estimating cost of indexing and storing one image as well as cost of performing a vector search.  
12. For the internal image search application, displaying all the metadata, % confidence information, and any matching facets for each search result.
13. Ability to recognize paid celebrity models
14. Handle Acute accent characters and other special characters. The character on top of the "e" in rose vs. rosé is called an acute accent (or accent aigu in French).  When applied to the letter "e" (é), it changes the pronunciation from a silent or soft sound to a sharp, distinct "ay" sound (as in "roh-ZAY").


# Important constraints:
- Keep image binaries in Blob Storage only.
- Azure AI Search stores vectors and metadata, not the full image binaries.
- Use the same embedding model/version for indexing and querying.
- Make the architecture easy to scale from a small POC to millions of images.
- Clearly separate POC shortcuts from production recommendations.