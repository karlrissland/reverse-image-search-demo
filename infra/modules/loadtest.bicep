@description('Azure region for all resources.')
param location string

@description('Resource name prefix.')
param prefix string

@description('Unique suffix for globally unique names.')
param uniqueSuffix string

@description('Tags to apply to all resources.')
param tags object = {}

var loadTestName = '${prefix}-loadtest-${uniqueSuffix}'

resource loadTest 'Microsoft.LoadTestService/loadTests@2022-12-01' = {
  name: loadTestName
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    description: 'Vision Search POC load testing (internal site, public site, and query API).'
  }
}

@description('Azure Load Testing resource name.')
output name string = loadTest.name

@description('Azure Load Testing resource ID.')
output id string = loadTest.id
