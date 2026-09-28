targetScope = 'subscription'

metadata description = 'Vision Search POC — subscription-scope infrastructure for Blob Storage, Azure AI Search, Vision/AI Services, a .NET 10 isolated Flex Consumption Function, two Static Web Apps sites, and Azure Load Testing.'

@minLength(1)
@maxLength(64)
@description('Name of the azd environment; used for the resource group name and tags.')
param environmentName string

@minLength(1)
@description('Primary Azure region. Multimodal embeddings (Vision VectorizeSkill) require a supported region; East US is recommended.')
param location string = 'eastus'

@description('Azure AI Search SKU. Basic is the POC default.')
@allowed([
  'basic'
  'standard'
  'standard2'
  'standard3'
])
param searchSku string = 'basic'

@description('Enable hybrid image + text retrieval in the query API.')
param hybridTextEnabled bool = false

@description('Enable semantic ranking for hybrid requests with text.')
param semanticRankingEnabled bool = false

@description('Enable query-image caption/tag generation through the provisioned chat model.')
param queryImageEnrichmentEnabled bool = false

@description('Enable internal-only allowlist-constrained celebrity recognition for query images.')
param celebrityImageRecognitionEnabled bool = false

@description('Minimum model confidence accepted for allowlist-constrained celebrity recognition.')
param celebrityRecognitionMinimumConfidence string = '0.85'

@description('Region for the Static Web Apps control plane. Must be a supported SWA region (East US is not); the CDN is global.')
@allowed([
  'eastus2'
  'centralus'
  'westus2'
  'westeurope'
  'eastasia'
])
param staticWebAppLocation string = 'eastus2'

@description('Object ID of the developer/CI principal that runs post-provision and data scripts. Granted data-plane roles (Search, Storage, AI Services). Defaults to the azd deploying principal.')
param deployerPrincipalId string = ''

@description('Additional tags to merge onto every resource.')
param tags object = {}

var namePrefix = 'vs'
var uniqueSuffix = take(uniqueString(subscription().subscriptionId, environmentName), 6)

var defaultTags = union(tags, {
  project: 'visionsearch'
  'azd-env-name': environmentName
  SecurityControl: 'Ignore'
})

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'rg-visionsearch-${environmentName}'
  location: location
  tags: defaultTags
}

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  scope: rg
  params: {
    location: location
    prefix: namePrefix
    uniqueSuffix: uniqueSuffix
    tags: defaultTags
  }
}

module storage 'modules/storage.bicep' = {
  name: 'storage'
  scope: rg
  params: {
    location: location
    prefix: namePrefix
    uniqueSuffix: uniqueSuffix
    tags: defaultTags
  }
}

module search 'modules/search.bicep' = {
  name: 'search'
  scope: rg
  params: {
    location: location
    prefix: namePrefix
    uniqueSuffix: uniqueSuffix
    searchSku: searchSku
    tags: defaultTags
  }
}

module aiServices 'modules/ai-services.bicep' = {
  name: 'ai-services'
  scope: rg
  params: {
    location: location
    prefix: namePrefix
    uniqueSuffix: uniqueSuffix
    tags: defaultTags
  }
}

module functionApp 'modules/function.bicep' = {
  name: 'function'
  scope: rg
  params: {
    location: location
    prefix: namePrefix
    uniqueSuffix: uniqueSuffix
    tags: defaultTags
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
    searchEndpoint: search.outputs.endpoint
    visionEndpoint: aiServices.outputs.endpoint
    chatDeploymentName: aiServices.outputs.chatDeploymentName
    chatModelVersion: aiServices.outputs.chatModelVersion
    hybridTextEnabled: hybridTextEnabled
    semanticRankingEnabled: semanticRankingEnabled
    queryImageEnrichmentEnabled: queryImageEnrichmentEnabled
    celebrityImageRecognitionEnabled: celebrityImageRecognitionEnabled
    celebrityRecognitionMinimumConfidence: celebrityRecognitionMinimumConfidence
    imagesBlobEndpoint: storage.outputs.blobEndpoint
    imagesContainerName: storage.outputs.imagesContainerName
  }
}

module sites 'modules/staticweb.bicep' = {
  name: 'staticweb'
  scope: rg
  params: {
    location: staticWebAppLocation
    prefix: namePrefix
    uniqueSuffix: uniqueSuffix
    tags: defaultTags
  }
}

module loadTest 'modules/loadtest.bicep' = {
  name: 'loadtest'
  scope: rg
  params: {
    location: location
    prefix: namePrefix
    uniqueSuffix: uniqueSuffix
    tags: defaultTags
  }
}

module rbac 'modules/rbac.bicep' = {
  name: 'rbac'
  scope: rg
  params: {
    searchPrincipalId: search.outputs.principalId
    functionPrincipalId: functionApp.outputs.principalId
    deployerPrincipalId: deployerPrincipalId
    assetsStorageAccountName: storage.outputs.accountName
    aiServicesAccountName: aiServices.outputs.accountName
    searchServiceName: search.outputs.serviceName
  }
}

output AZURE_LOCATION string = location
output AZURE_SUBSCRIPTION_ID string = subscription().subscriptionId
output AZURE_RESOURCE_GROUP string = rg.name

output AZURE_STORAGE_ACCOUNT_NAME string = storage.outputs.accountName
output AZURE_STORAGE_BLOB_ENDPOINT string = storage.outputs.blobEndpoint
output AZURE_STORAGE_IMAGES_CONTAINER string = storage.outputs.imagesContainerName

output AZURE_SEARCH_ENDPOINT string = search.outputs.endpoint
output AZURE_SEARCH_SERVICE_NAME string = search.outputs.serviceName

output AZURE_AISERVICES_ENDPOINT string = aiServices.outputs.endpoint
output AZURE_AISERVICES_ACCOUNT_NAME string = aiServices.outputs.accountName
output AZURE_AISERVICES_CHAT_DEPLOYMENT string = aiServices.outputs.chatDeploymentName
output AZURE_AISERVICES_CHAT_MODEL string = aiServices.outputs.chatModelName
output AZURE_AISERVICES_CHAT_MODEL_VERSION string = aiServices.outputs.chatModelVersion

output AZURE_FUNCTION_NAME string = functionApp.outputs.functionName
output AZURE_FUNCTION_URI string = functionApp.outputs.uri

output AZURE_INTERNAL_SITE_NAME string = sites.outputs.internalName
output AZURE_INTERNAL_SITE_URI string = sites.outputs.internalUri
output AZURE_PUBLIC_SITE_NAME string = sites.outputs.publicName
output AZURE_PUBLIC_SITE_URI string = sites.outputs.publicUri

output AZURE_LOADTEST_NAME string = loadTest.outputs.name

output APPLICATIONINSIGHTS_CONNECTION_STRING string = monitoring.outputs.appInsightsConnectionString
