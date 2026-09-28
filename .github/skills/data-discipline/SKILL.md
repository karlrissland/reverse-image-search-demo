---
name: data-discipline
description: Use when changing image manifests, Blob uploads, metadata mappings, Unicode handling, enrichment provenance, fixtures, or public/internal field boundaries.
---

# Data Discipline

The user-provided dataset is authoritative. Keep a small technical fixture for tests. Validate unique asset IDs, required metadata, Blob linkage, content types, and expected counts. Preserve Unicode such as `rosé` and accented names in JSON and Search. Keep generated fields traceable to their source and never expose internal fields through the public response contract.
