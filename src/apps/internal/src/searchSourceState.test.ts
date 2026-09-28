import { describe, expect, it } from 'vitest';
import { getSearchButtonLabel } from './searchButtonLabel';
import {
  activeCrop,
  buildSearchSource,
  cropAfterFileChange,
  cropAfterModeChange,
  type SearchSourceMode,
} from './searchSourceState';

describe('search source transitions', () => {
  const image = new Blob(['image']);
  const nextImage = new Blob(['next-image']);
  const crop = new Blob(['crop']);

  it('clears a crop when switching to URL and does not submit it', () => {
    const nextCrop = cropAfterModeChange('upload', 'url', crop);
    expect(nextCrop).toBeNull();
    expect(getSearchButtonLabel({
      loading: false,
      cropActive: activeCrop('url', image, nextCrop) !== null,
    })).toBe('Find similar');
    expect(buildSearchSource({
      mode: 'url',
      imageUrl: ' https://example.test/query.jpg ',
      file: image,
      cropBlob: crop,
      textQuery: ' navy ',
    })).toEqual({
      imageUrl: 'https://example.test/query.jpg',
      textQuery: 'navy',
    });
  });

  it('does not resurrect a crop after returning from URL to upload', () => {
    let mode: SearchSourceMode = 'upload';
    let currentCrop: Blob | null = crop;
    currentCrop = cropAfterModeChange(mode, 'url', currentCrop);
    mode = 'url';
    currentCrop = cropAfterModeChange(mode, 'upload', currentCrop);
    mode = 'upload';

    expect(activeCrop(mode, image, currentCrop)).toBeNull();
    expect(getSearchButtonLabel({ loading: false, cropActive: false })).toBe('Find similar');
  });

  it('clears crop for a new upload and uses the new image payload', () => {
    const currentCrop = cropAfterFileChange();
    const source = buildSearchSource({
      mode: 'upload',
      imageUrl: '',
      file: nextImage,
      cropBlob: currentCrop,
      textQuery: '',
    });

    expect(source).toEqual({ imageFile: nextImage, textQuery: undefined });
    expect(source).not.toHaveProperty('cropFile');
  });

  it('supports URL then a genuinely active crop', () => {
    const source = buildSearchSource({
      mode: 'upload',
      imageUrl: 'https://example.test/old.jpg',
      file: image,
      cropBlob: crop,
      textQuery: '',
    });

    expect(source).toEqual({ cropFile: crop, textQuery: undefined });
    expect(getSearchButtonLabel({
      loading: false,
      cropActive: activeCrop('upload', image, crop) !== null,
    })).toBe('Search selected area');
  });

  it('keeps exact CTA copy for empty and text-only states', () => {
    expect(getSearchButtonLabel({ loading: false, cropActive: false })).toBe('Find similar');
    expect(buildSearchSource({
      mode: 'upload',
      imageUrl: '',
      file: null,
      cropBlob: crop,
      textQuery: ' Ariana Grande ',
    })).toEqual({ textQuery: 'Ariana Grande' });
  });
});
