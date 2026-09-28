@description('Azure region for all resources.')
param location string

@description('Resource name prefix (alphanumeric only for storage).')
param prefix string

@description('Unique suffix for globally unique names.')
param uniqueSuffix string

@description('Tags to apply to all resources.')
param tags object = {}

var cleanPrefix = toLower(replace(replace(prefix, '-', ''), '_', ''))
var storageAccountName = take('${cleanPrefix}stg${uniqueSuffix}', 24)
var imagesContainerName = 'images'

// Private image storage. Shared-key access is disabled to comply with the
// tenant-wide AAD-only governance policy; access is via managed identity and
// user-delegation SAS only. No image binaries are ever stored in Search.
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource blobServices 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
}

resource imagesContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobServices
  name: imagesContainerName
  properties: {
    publicAccess: 'None'
  }
}

@description('Storage account name.')
output accountName string = storageAccount.name

@description('Storage account resource ID.')
output accountId string = storageAccount.id

@description('Primary blob endpoint.')
output blobEndpoint string = storageAccount.properties.primaryEndpoints.blob

@description('Images container name.')
output imagesContainerName string = imagesContainerName
