@description('Azure region for all resources. Multimodal embeddings require a supported region (East US recommended).')
param location string

@description('Resource name prefix.')
param prefix string

@description('Unique suffix for globally unique names.')
param uniqueSuffix string

@description('Tags to apply to all resources.')
param tags object = {}

@description('Vision-capable chat model deployed for indexing-time image verbalization (caption/tags/color) and query-time explainability.')
param chatModelName string = 'gpt-4o'

@description('Chat model version. Must be a vision-capable version available in the target region.')
param chatModelVersion string = '2024-11-20'

@description('Model deployment SKU. GlobalStandard is the demo default.')
param chatDeploymentSku string = 'GlobalStandard'

@description('Model deployment capacity in thousands of tokens per minute.')
param chatDeploymentCapacity int = 50

@description('Name of the chat model deployment (referenced by the Search skillset and query API).')
param chatDeploymentName string = 'gpt-4o'

var aiServicesName = '${prefix}-ai-${uniqueSuffix}'

// Multi-service AI account. Provides the Vision multimodal embeddings (retrieval:vectorizeText /
// retrieval:vectorizeImage) used at query time and by the Search VectorizeSkill at ingestion.
// Local (key) auth is disabled to comply with the tenant-wide AAD-only policy.
resource aiServices 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: aiServicesName
  location: location
  tags: tags
  kind: 'AIServices'
  sku: {
    name: 'S0'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    publicNetworkAccess: 'Enabled'
    customSubDomainName: aiServicesName
    disableLocalAuth: true
  }
}

// Vision-capable chat model. Called via AAD by the Search skillset (image verbalization at ingestion)
// and by the query API (explainability). Data-plane access is granted in rbac.bicep.
resource chatDeployment 'Microsoft.CognitiveServices/accounts/deployments@2025-06-01' = {
  parent: aiServices
  name: chatDeploymentName
  sku: {
    name: chatDeploymentSku
    capacity: chatDeploymentCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: chatModelName
      version: chatModelVersion
    }
  }
}

@description('AI Services account name.')
output accountName string = aiServices.name

@description('AI Services account resource ID.')
output accountId string = aiServices.id

@description('AI Services endpoint (Vision multimodal embeddings).')
output endpoint string = aiServices.properties.endpoint

@description('AI Services managed identity principal ID.')
output principalId string = aiServices.identity.principalId

@description('Chat model deployment name (for the Search skillset and query API).')
output chatDeploymentName string = chatDeployment.name

@description('Deployed chat model name.')
output chatModelName string = chatModelName

@description('Deployed chat model version.')
output chatModelVersion string = chatModelVersion
