@description('Azure region for the Static Web Apps control plane. Must be a supported SWA region (not East US).')
param location string

@description('Resource name prefix.')
param prefix string

@description('Unique suffix for globally unique names.')
param uniqueSuffix string

@description('Static Web Apps SKU. Free is the POC default and consumes no App Service compute quota.')
@allowed([
  'Free'
  'Standard'
])
param sku string = 'Free'

@description('Tags to apply to all resources.')
param tags object = {}

var internalName = '${prefix}-internal-${uniqueSuffix}'
var publicName = '${prefix}-public-${uniqueSuffix}'

resource internalSite 'Microsoft.Web/staticSites@2024-04-01' = {
  name: internalName
  location: location
  tags: union(tags, {
    'azd-service-name': 'internal'
  })
  sku: {
    name: sku
    tier: sku
  }
  properties: {
    // Content is pushed by azd / SWA CLI; no linked source-control repo.
    allowConfigFileUpdates: true
    stagingEnvironmentPolicy: 'Enabled'
  }
}

resource publicSite 'Microsoft.Web/staticSites@2024-04-01' = {
  name: publicName
  location: location
  tags: union(tags, {
    'azd-service-name': 'public'
  })
  sku: {
    name: sku
    tier: sku
  }
  properties: {
    allowConfigFileUpdates: true
    stagingEnvironmentPolicy: 'Enabled'
  }
}

@description('Internal site name.')
output internalName string = internalSite.name

@description('Internal site URI.')
output internalUri string = 'https://${internalSite.properties.defaultHostname}'

@description('Public site name.')
output publicName string = publicSite.name

@description('Public site URI.')
output publicUri string = 'https://${publicSite.properties.defaultHostname}'
