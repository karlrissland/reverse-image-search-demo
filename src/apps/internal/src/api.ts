import { apiUrl } from './config';
import type { SearchRequest, SearchResponse } from './types';

// Calls the internal query endpoint. Uses multipart/form-data when an image or crop
// blob is supplied, otherwise a JSON body with imageUrl.
export async function searchInternal(request: SearchRequest): Promise<SearchResponse> {
  const url = apiUrl('/api/search/internal');
  const filtersJson = JSON.stringify(pruneFilters(request.filters));

  let response: Response;
  if (request.cropFile || request.imageFile) {
    const form = new FormData();
    if (request.cropFile) {
      form.append('crop', request.cropFile, 'crop.png');
    } else if (request.imageFile) {
      form.append('image', request.imageFile, 'query.png');
    }
    form.append('top', String(request.top));
    form.append('filters', filtersJson);
    if (request.textQuery) form.append('textQuery', request.textQuery);
    response = await fetch(url, { method: 'POST', body: form });
  } else {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl: request.imageUrl,
        textQuery: request.textQuery,
        top: request.top,
        filters: pruneFilters(request.filters),
      }),
    });
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Search failed (${response.status}). ${text}`.trim());
  }

  return (await response.json()) as SearchResponse;
}

function pruneFilters(filters: Record<string, string[]>): Record<string, string[]> {
  const pruned: Record<string, string[]> = {};
  for (const [field, values] of Object.entries(filters)) {
    if (values.length > 0) {
      pruned[field] = values;
    }
  }
  return pruned;
}
