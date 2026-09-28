# Vision Search Repository Instructions

## Project

This repository contains an Azure-native image-search POC. Keep image binaries in private Blob Storage. Azure AI Search stores one logical document per image asset, including metadata, facets, and the validated multimodal image vector. The .NET 10 isolated Azure Function is the query API. The internal and public-style React/Vite/TypeScript sites deploy as separate Azure App Service apps.

## Working rules

- Read `plan.md` and the relevant requirements before changing architecture.
- Treat `#Microsoft.Skills.Vision.VectorizeSkill` validation as a hard gate. Never silently replace it with legacy Image Analysis or text embeddings.
- Use managed identities and `DefaultAzureCredential` where possible. Never commit keys, tokens, SAS URLs, or private customer data.
- Preserve Unicode in JSON, Search fields, APIs, and UI. ASCII-only conversion is allowed only where an Azure HTTP header requires it.
- Keep Search documents free of image binaries.
- Keep public API responses separate from internal metadata, provenance, and diagnostics.
- Prefer idempotent scripts and explicit readiness checks.
- Use PowerShell for Windows deployment orchestration and keep scripts parameterized.
- Use Azure Load Testing with parameterized Locust scripts for performance validation.
- Keep POC shortcuts documented beside production recommendations.

## Validation

Run focused tests after each change. For infrastructure, validate Bicep and `azd` configuration before deployment. For .NET, use `dotnet build` and `dotnet test`. For frontend apps, use the package manager scripts in the app. For Search/data changes, run manifest validation and indexer/query checks. Do not claim capability support until the capability spike has evidence.


