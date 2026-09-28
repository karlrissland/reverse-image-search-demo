import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

async function source(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

for (const surface of ['public', 'internal']) {
  test(`${surface} surface keeps the reference visual-search language`, async () => {
    const app = await source(`src/apps/${surface}/src/App.tsx`);
    const branding = await source(`src/apps/${surface}/src/branding.ts`);
    const searchPanel = await source(`src/apps/${surface}/src/components/SearchPanel.tsx`);
    const searchCopy = surface === 'internal'
      ? `${searchPanel}\n${await source('src/apps/internal/src/searchButtonLabel.ts')}`
      : searchPanel;

    assert.match(app, /brand\.name/);
    assert.match(app, /brand\.heroTitle/);
    assert.match(app, /Explore matches/);
    assert.match(branding, /Contoso Apparel/);
    assert.doesNotMatch(app, /Ralph|Lauren/);
    assert.doesNotMatch(branding, /Ralph|Lauren/);
    assert.match(searchPanel, /Visual Search/);
    assert.match(searchPanel, /Upload image/);
    assert.match(searchPanel, /Image URL/);
    assert.match(searchPanel, /Drop a campaign, product, or street-style image/);
    assert.match(searchPanel, /Result count/);
    assert.match(searchCopy, /Find similar/);
  });

  test(`${surface} surface keeps upload, crop, URL, text, top, and facets wired`, async () => {
    const api = await source(`src/apps/${surface}/src/api.ts`);
    const searchPanel = await source(`src/apps/${surface}/src/components/SearchPanel.tsx`);
    const app = await source(`src/apps/${surface}/src/App.tsx`);

    assert.match(api, /request\.cropFile/);
    assert.match(api, /request\.imageFile/);
    assert.match(api, /imageUrl: request\.imageUrl/);
    assert.match(api, /textQuery: request\.textQuery/);
    assert.match(api, /top: request\.top/);
    assert.match(api, /filters/);
    if (surface === 'internal') {
      const searchSourceState = await source('src/apps/internal/src/searchSourceState.ts');
      assert.match(searchPanel, /buildSearchSource/);
      assert.match(searchSourceState, /cropFile/);
      assert.match(searchSourceState, /mode === 'url'/);
    } else {
      assert.match(searchPanel, /cropFile: cropBlob/);
    }
    assert.match(app, /toggleFacet/);
    assert.match(app, /matchState === 'noStrongMatch'/);
  });
}

test('public and internal API boundaries remain distinct', async () => {
  const publicApi = await source('src/apps/public/src/api.ts');
  const internalApi = await source('src/apps/internal/src/api.ts');
  const publicTypes = await source('src/apps/public/src/types.ts');
  const internalTypes = await source('src/apps/internal/src/types.ts');

  assert.match(publicApi, /\/api\/search'/);
  assert.doesNotMatch(publicApi, /\/api\/search\/internal/);
  assert.match(internalApi, /\/api\/search\/internal/);
  assert.doesNotMatch(publicTypes, /blobPath|hybridScore|semanticRerankerScore|celebrityName|celebrityFilter/);
  assert.match(internalTypes, /blobPath/);
  assert.match(internalTypes, /queryInterpretation/);
  assert.match(internalTypes, /celebrityName/);
  assert.match(internalTypes, /celebrityIntentSource/);
});

test('internal result heading keeps count and removes primary bylines', async () => {
  const internalApp = await source('src/apps/internal/src/App.tsx');

  assert.match(internalApp, /results\.length.*visually similar assets/s);
  assert.match(internalApp, /results\.length.*assets tagged with/s);
  assert.doesNotMatch(internalApp, /Strongest visual matches first/);
  assert.doesNotMatch(internalApp, /Your strongest catalog matches will appear here/);
  assert.doesNotMatch(internalApp, /Results come from indexed celebrity metadata/);
});

test('internal reasoning disclosure uses accessible plain-language celebrity copy', async () => {
  const internalApp = await source('src/apps/internal/src/App.tsx');
  const reasoningPanel = await source('src/apps/internal/src/components/ReasoningPanel.tsx');
  const internalPanel = await source('src/apps/internal/src/components/SearchPanel.tsx');

  assert.match(
    internalApp,
    /<ReasoningPanel[\s\S]*interpretation=\{queryInterpretation\}[\s\S]*request=\{requestContext\}/,
  );
  assert.match(reasoningPanel, /<summary>Reasoning<\/summary>/);
  assert.match(reasoningPanel, /aria-label="Reasoning about this search"/);
  assert.match(reasoningPanel, /formatSearchReasoning/);
  assert.doesNotMatch(reasoningPanel, /Internal query interpretation/);
  assert.doesNotMatch(
    reasoningPanel,
    /InvalidModelOutput|invalidModelOutput|Not available|Not Available|Not applied|Not generated/,
  );
  assert.doesNotMatch(reasoningPanel, /ModelVersion|model version|Celebrity fallback|recognition confidence|<dl/i);
  assert.match(internalPanel, /getSearchButtonLabel/);
  assert.doesNotMatch(internalPanel, /Search celebrity metadata/);
  assert.match(internalPanel, /full celebrity name currently tagged in the index/);
});

test('public surface excludes internal celebrity reasoning and diagnostics', async () => {
  const publicApp = await source('src/apps/public/src/App.tsx');
  const publicTypes = await source('src/apps/public/src/types.ts');

  assert.doesNotMatch(publicApp, /Reasoning about this search|Celebrity recognition/);
  assert.doesNotMatch(
    publicTypes,
    /celebrityRecognition|celebrityFallbackReason|celebrityIntentSource|celebrityFilter/,
  );
});

test('internal workspace follows the campaign without the redundant intro band', async () => {
  const internalApp = await source('src/apps/internal/src/App.tsx');

  assert.doesNotMatch(internalApp, /Internal catalog/);
  assert.doesNotMatch(internalApp, /Editorial polish, operational clarity\./);
  assert.match(internalApp, /<section className="showcase" id="search">\s*<div className="layout">/);
});
