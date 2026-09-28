# Infrastructure

Bicep modules and `azd` infrastructure for Blob Storage, Azure AI Search, Vision/AI Services, the .NET Function, shared App Service plan/apps, and Azure Load Testing.

`CELEBRITY_IMAGE_RECOGNITION_ENABLED` defaults to `false`. When explicitly enabled,
the internal API uses the existing managed-identity chat deployment and accepts only
index-derived allowlist matches at
`CELEBRITY_RECOGNITION_MIN_CONFIDENCE` (default `0.85`). No separate celebrity
allowlist secret or configuration is provisioned.
