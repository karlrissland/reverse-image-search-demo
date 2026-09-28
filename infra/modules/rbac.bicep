@description('Azure AI Search managed identity principal ID.')
param searchPrincipalId string

@description('Function app managed identity principal ID.')
param functionPrincipalId string

@description('Developer/CI principal object ID for data-plane access during post-provision and scripts. Optional.')
param deployerPrincipalId string = ''

@description('Assets storage account name.')
param assetsStorageAccountName string

@description('AI Services account name.')
param aiServicesAccountName string

@description('Azure AI Search service name.')
param searchServiceName string

// Role definition IDs
var storageBlobDataReaderRole = '2a2b9908-6ea1-4ae2-8e65-a410df84e7d1'
var storageBlobDataContributorRole = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
var storageBlobDelegatorRole = 'db58b8e5-c6ad-4a2a-8342-4190687cbf4a'
var cognitiveServicesUserRole = 'a97b65f3-24c7-4388-baec-2e87135dc908'
var cognitiveServicesOpenAIUserRole = '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'
var searchIndexDataReaderRole = '1407120a-92aa-4202-b7e9-c0e197c71c8f'
var searchIndexDataContributorRole = '8ebe5a00-799e-43f5-93ac-243d3dce84a7'
var searchServiceContributorRole = '7ca78c08-252a-4471-8644-bb5ff32d4ba0'

resource assetsStorage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: assetsStorageAccountName
}

resource aiServices 'Microsoft.CognitiveServices/accounts@2025-06-01' existing = {
  name: aiServicesAccountName
}

resource searchService 'Microsoft.Search/searchServices@2024-03-01-preview' existing = {
  name: searchServiceName
}

// ── Azure AI Search identity ──────────────────────────────────────────────
// Read image blobs for indexing.
resource searchStorageReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(assetsStorage.id, searchPrincipalId, storageBlobDataReaderRole)
  scope: assetsStorage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataReaderRole)
    principalId: searchPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// Call the Vision VectorizeSkill at ingestion.
resource searchAiUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(aiServices.id, searchPrincipalId, cognitiveServicesUserRole)
  scope: aiServices
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesUserRole)
    principalId: searchPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// Call the chat model deployment for image verbalization at ingestion.
resource searchOpenAiUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(aiServices.id, searchPrincipalId, cognitiveServicesOpenAIUserRole)
  scope: aiServices
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesOpenAIUserRole)
    principalId: searchPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// ── Function (query API) identity ─────────────────────────────────────────
// Query the Search index.
resource functionSearchReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(searchService.id, functionPrincipalId, searchIndexDataReaderRole)
  scope: searchService
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', searchIndexDataReaderRole)
    principalId: functionPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// Vectorize query images/text at query time.
resource functionAiUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(aiServices.id, functionPrincipalId, cognitiveServicesUserRole)
  scope: aiServices
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesUserRole)
    principalId: functionPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// Call the chat model deployment for query-time explainability.
resource functionOpenAiUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(aiServices.id, functionPrincipalId, cognitiveServicesOpenAIUserRole)
  scope: aiServices
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesOpenAIUserRole)
    principalId: functionPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// Read blobs to mint user-delegation SAS.
resource functionStorageReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(assetsStorage.id, functionPrincipalId, storageBlobDataReaderRole)
  scope: assetsStorage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataReaderRole)
    principalId: functionPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// Generate user-delegation keys for short-lived read-only SAS URLs.
resource functionStorageDelegator 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(assetsStorage.id, functionPrincipalId, storageBlobDelegatorRole)
  scope: assetsStorage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDelegatorRole)
    principalId: functionPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// ── Developer / CI identity (post-provision + data scripts) ───────────────
resource deployerStorageContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(deployerPrincipalId)) {
  name: guid(assetsStorage.id, deployerPrincipalId, storageBlobDataContributorRole)
  scope: assetsStorage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRole)
    principalId: deployerPrincipalId
    principalType: 'User'
  }
}

resource deployerAiUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(deployerPrincipalId)) {
  name: guid(aiServices.id, deployerPrincipalId, cognitiveServicesUserRole)
  scope: aiServices
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesUserRole)
    principalId: deployerPrincipalId
    principalType: 'User'
  }
}

resource deployerOpenAiUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(deployerPrincipalId)) {
  name: guid(aiServices.id, deployerPrincipalId, cognitiveServicesOpenAIUserRole)
  scope: aiServices
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesOpenAIUserRole)
    principalId: deployerPrincipalId
    principalType: 'User'
  }
}

resource deployerSearchService 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(deployerPrincipalId)) {
  name: guid(searchService.id, deployerPrincipalId, searchServiceContributorRole)
  scope: searchService
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', searchServiceContributorRole)
    principalId: deployerPrincipalId
    principalType: 'User'
  }
}

resource deployerSearchData 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(deployerPrincipalId)) {
  name: guid(searchService.id, deployerPrincipalId, searchIndexDataContributorRole)
  scope: searchService
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', searchIndexDataContributorRole)
    principalId: deployerPrincipalId
    principalType: 'User'
  }
}
