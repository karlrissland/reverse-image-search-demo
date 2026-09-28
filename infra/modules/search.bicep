@description('Azure region for all resources.')
param location string

@description('Resource name prefix.')
param prefix string

@description('Unique suffix for globally unique names.')
param uniqueSuffix string

@description('Azure AI Search SKU.')
param searchSku string = 'basic'

@description('Tags to apply to all resources.')
param tags object = {}

var searchName = '${prefix}-search-${uniqueSuffix}'

// Local (key) auth is disabled to comply with the tenant-wide AAD-only policy.
// Callers authenticate with managed identity / Entra ID via RBAC data-plane roles.
resource searchService 'Microsoft.Search/searchServices@2024-03-01-preview' = {
  name: searchName
  location: location
  tags: tags
  sku: {
    name: searchSku
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    replicaCount: 1
    partitionCount: 1
    hostingMode: 'default'
    publicNetworkAccess: 'enabled'
    disableLocalAuth: true
    authOptions: null
    semanticSearch: 'free'
  }
}

@description('Search service name.')
output serviceName string = searchService.name

@description('Search service resource ID.')
output serviceId string = searchService.id

@description('Search service endpoint.')
output endpoint string = 'https://${searchService.name}.search.windows.net'

@description('Search service managed identity principal ID.')
output principalId string = searchService.identity.principalId
