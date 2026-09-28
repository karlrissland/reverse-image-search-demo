---
name: azure-deployment
description: Use when working on azd, Bicep, Azure App Service, Flex Consumption Functions, managed identities, RBAC, post-provision scripts, or teardown for the Vision Search POC.
---

# Azure Deployment

Use `azd` for lifecycle management and Bicep for infrastructure. Follow Bunzel naming, resource-group tagging, outputs, and readiness patterns. Keep Search SKU configurable with Basic as the default. Deploy the two React sites and .NET Function through repeatable, parameterized PowerShell scripts invoked by the azd lifecycle. Use managed identity/RBAC and never commit credentials.
