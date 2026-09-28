@description('Azure region for all resources.')
param location string

@description('Resource name prefix.')
param prefix string

@description('Unique suffix for globally unique names.')
param uniqueSuffix string

@description('Application Insights connection string.')
param appInsightsConnectionString string

@description('Azure AI Search endpoint (query API).')
param searchEndpoint string

@description('Azure AI Search index name.')
param searchIndexName string = 'vision-assets'

@description('Minimum top-result similarity required to present a search as a match.')
param noStrongMatchThreshold string = '0.78'

@description('Enable deterministic second-pass metadata-consensus reranking.')
param rerankingEnabled bool = true

@description('Number of vector candidates retrieved before returning the requested top results.')
@minValue(30)
@maxValue(50)
param rerankingCandidateCount int = 40

@description('Enable text signals in hybrid vector + keyword retrieval.')
param hybridTextEnabled bool = false

@description('Enable semantic ranking for hybrid requests that contain a text signal.')
param semanticRankingEnabled bool = false

@description('Enable query-image caption/tag generation through the provisioned chat model. Requires hybridTextEnabled.')
param queryImageEnrichmentEnabled bool = false

@description('Enable internal-only allowlist-constrained query-image celebrity recognition.')
param celebrityImageRecognitionEnabled bool = false

@description('Minimum accepted celebrity recognition confidence from 0 to 1.')
param celebrityRecognitionMinimumConfidence string = '0.85'

@description('Maximum accepted optional textQuery length.')
@minValue(1)
@maxValue(2000)
param textQueryMaxLength int = 500

@description('Vision multimodal embeddings endpoint (AI Services account).')
param visionEndpoint string

@description('Vision-capable chat deployment used for gated query-image interpretation.')
param chatDeploymentName string

@description('Version of the deployed query-image interpretation model.')
param chatModelVersion string

@description('Assets storage blob endpoint (for minting short-lived SAS on result images).')
param imagesBlobEndpoint string

@description('Container holding the image assets.')
param imagesContainerName string = 'images'

@description('Tags to apply to all resources.')
param tags object = {}

var cleanPrefix = toLower(replace(replace(prefix, '-', ''), '_', ''))
var hostStorageName = take('${cleanPrefix}fnstg${uniqueSuffix}', 24)
var planName = '${prefix}-fnplan-${uniqueSuffix}'
var functionName = '${prefix}-fn-${uniqueSuffix}'
var deploymentContainerName = 'deploymentpackage'

var storageBlobDataOwnerRole = 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b'
var storageQueueDataContributorRole = '974c5e8b-45b9-4653-ba55-5f855dd0fb88'

// Host storage for the Flex Consumption function. Identity-based (no keys) to comply
// with the tenant-wide AAD-only policy.
resource hostStorage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: hostStorageName
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource hostBlobServices 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: hostStorage
  name: 'default'
}

resource deploymentContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: hostBlobServices
  name: deploymentContainerName
  properties: {
    publicAccess: 'None'
  }
}

resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: planName
  location: location
  tags: tags
  sku: {
    name: 'FC1'
    tier: 'FlexConsumption'
  }
  kind: 'functionapp'
  properties: {
    reserved: true
  }
}

resource functionApp 'Microsoft.Web/sites@2024-04-01' = {
  name: functionName
  location: location
  tags: union(tags, {
    'azd-service-name': 'api'
  })
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${hostStorage.properties.primaryEndpoints.blob}${deploymentContainerName}'
          authentication: {
            type: 'SystemAssignedIdentity'
          }
        }
      }
      scaleAndConcurrency: {
        maximumInstanceCount: 40
        instanceMemoryMB: 2048
      }
      runtime: {
        name: 'dotnet-isolated'
        version: '10.0'
      }
    }
    siteConfig: {
      appSettings: [
        {
          name: 'AzureWebJobsStorage__blobServiceUri'
          value: hostStorage.properties.primaryEndpoints.blob
        }
        {
          name: 'AzureWebJobsStorage__queueServiceUri'
          value: hostStorage.properties.primaryEndpoints.queue
        }
        {
          name: 'AzureWebJobsStorage__tableServiceUri'
          value: hostStorage.properties.primaryEndpoints.table
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsightsConnectionString
        }
        {
          name: 'SEARCH_ENDPOINT'
          value: searchEndpoint
        }
        {
          name: 'SEARCH_INDEX_NAME'
          value: searchIndexName
        }
        {
          name: 'SEARCH_API_VERSION'
          value: '2026-04-01'
        }
        {
          name: 'NO_STRONG_MATCH_THRESHOLD'
          value: noStrongMatchThreshold
        }
        {
          name: 'RERANKING_ENABLED'
          value: string(rerankingEnabled)
        }
        {
          name: 'RERANKING_CANDIDATE_COUNT'
          value: string(rerankingCandidateCount)
        }
        {
          name: 'HYBRID_TEXT_ENABLED'
          value: string(hybridTextEnabled)
        }
        {
          name: 'SEMANTIC_RANKING_ENABLED'
          value: string(semanticRankingEnabled)
        }
        {
          name: 'QUERY_IMAGE_ENRICHMENT_ENABLED'
          value: string(queryImageEnrichmentEnabled)
        }
        {
          name: 'CELEBRITY_IMAGE_RECOGNITION_ENABLED'
          value: string(celebrityImageRecognitionEnabled)
        }
        {
          name: 'CELEBRITY_RECOGNITION_MIN_CONFIDENCE'
          value: celebrityRecognitionMinimumConfidence
        }
        {
          name: 'TEXT_QUERY_MAX_LENGTH'
          value: string(textQueryMaxLength)
        }
        {
          name: 'VISION_ENDPOINT'
          value: visionEndpoint
        }
        {
          name: 'VISION_API_VERSION'
          value: '2024-02-01'
        }
        {
          name: 'VISION_MODEL_VERSION'
          value: '2023-04-15'
        }
        {
          name: 'CHAT_DEPLOYMENT'
          value: chatDeploymentName
        }
        {
          name: 'CHAT_API_VERSION'
          value: '2024-10-21'
        }
        {
          name: 'CHAT_MODEL_VERSION'
          value: chatModelVersion
        }
        {
          name: 'IMAGES_BLOB_ENDPOINT'
          value: imagesBlobEndpoint
        }
        {
          name: 'IMAGES_CONTAINER'
          value: imagesContainerName
        }
        {
          name: 'SAS_TTL_MINUTES'
          value: '15'
        }
      ]
      // POC: permissive CORS so the two SPA sites can call the API before their URLs are known.
      // Production should restrict allowedOrigins to the internal and public site origins.
      cors: {
        allowedOrigins: [
          '*'
        ]
      }
    }
  }
}

// Runtime identity access to the host storage (blobs + queues).
resource fnHostBlobRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(hostStorage.id, functionApp.id, storageBlobDataOwnerRole)
  scope: hostStorage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataOwnerRole)
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource fnHostQueueRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(hostStorage.id, functionApp.id, storageQueueDataContributorRole)
  scope: hostStorage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageQueueDataContributorRole)
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

@description('Function app name.')
output functionName string = functionApp.name

@description('Function app managed identity principal ID.')
output principalId string = functionApp.identity.principalId

@description('Function app base URI.')
output uri string = 'https://${functionApp.properties.defaultHostName}'
