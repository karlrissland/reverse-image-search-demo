# Data

The committed demo image library lives in `data/images/` and is tracked in git. This directory also holds the manifest schema, a small technical fixture, and validation documentation. Preserve Unicode, keep image bytes out of the Search index, and never commit restricted or customer-confidential imagery.

## Metadata

`data/manifest.json` (schema `data/manifest.schema.json`) is the metadata source of record. Each entry
carries the required `assetId` / `imagePath` / `category` / `public` plus the generic facets
(`subcategory`, `collection`, `color`, `season`, `caption`, `tags`, and the celebrity fields). An
optional **`attributes`** object (string map) holds extra passthrough fields from onboarding scrapes
(e.g. `sku`, `price`, `material`) — sidecar/caption use only, **not** auto-faceted. Per-image
`.metadata.json` sidecars hold the descriptive fields plus enrichment provenance.
