@description('Azure region for all resources.')
param location string

@description('Resource name prefix.')
param prefix string

@description('Unique suffix for globally unique names.')
param uniqueSuffix string

@description('Tags to apply to all resources.')
param tags object = {}

var workspaceName = '${prefix}-log-${uniqueSuffix}'
var appInsightsName = '${prefix}-appi-${uniqueSuffix}'

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: workspaceName
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: workspace.id
    IngestionMode: 'LogAnalytics'
  }
}

@description('Log Analytics workspace resource ID.')
output workspaceId string = workspace.id

@description('Application Insights connection string.')
output appInsightsConnectionString string = appInsights.properties.ConnectionString
