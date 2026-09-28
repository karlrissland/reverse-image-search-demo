import { describe, expect, it } from 'vitest';
import { getSearchButtonLabel } from './searchButtonLabel';

describe('getSearchButtonLabel', () => {
  it('uses Find similar before and after image selection, including text-only search', () => {
    expect(getSearchButtonLabel({ loading: false, cropActive: false })).toBe('Find similar');
  });

  it('uses the intentional crop-specific active label', () => {
    expect(getSearchButtonLabel({ loading: false, cropActive: true }))
      .toBe('Search selected area');
  });

  it('announces loading without changing search behavior', () => {
    expect(getSearchButtonLabel({ loading: true, cropActive: false })).toBe('Searching…');
    expect(getSearchButtonLabel({ loading: true, cropActive: true })).toBe('Searching…');
  });
});
