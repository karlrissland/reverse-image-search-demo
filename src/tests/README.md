# Tests

Unit, contract, integration, and end-to-end validation for manifests, Unicode, Search schema, API responses, SAS behavior, and crop-query payloads.

- `search-schema.tests.ps1` validates the desired Search definition, immutable
  field detection, and API/Search hybrid-field consistency.
- `search-control-path.tests.ps1` invokes the production Search configuration
  script with deterministic Azure CLI/REST mocks. It verifies compatible
  update ordering, fail-fast immutable-schema handling before mutation, and the
  explicit reset/delete/recreate/indexer-readiness path without touching Azure.
