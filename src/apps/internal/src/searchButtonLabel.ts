export interface SearchButtonState {
  loading: boolean;
  cropActive: boolean;
}

export function getSearchButtonLabel({ loading, cropActive }: SearchButtonState): string {
  if (loading) return 'Searching…';
  if (cropActive) return 'Search selected area';
  return 'Find similar';
}
