export type SearchSourceMode = 'upload' | 'url';

export interface SearchSourceInput {
  mode: SearchSourceMode;
  imageUrl: string;
  file: Blob | null;
  cropBlob: Blob | null;
  textQuery: string;
}

export interface SearchSource {
  imageUrl?: string;
  imageFile?: Blob;
  cropFile?: Blob;
  textQuery?: string;
}

export function cropAfterModeChange(
  currentMode: SearchSourceMode,
  nextMode: SearchSourceMode,
  cropBlob: Blob | null,
): Blob | null {
  return currentMode === nextMode ? cropBlob : null;
}

export function cropAfterFileChange(): null {
  return null;
}

export function activeCrop(
  mode: SearchSourceMode,
  file: Blob | null,
  cropBlob: Blob | null,
): Blob | null {
  return mode === 'upload' && file ? cropBlob : null;
}

export function buildSearchSource(input: SearchSourceInput): SearchSource {
  const textQuery = input.textQuery.trim() || undefined;
  if (input.mode === 'url') {
    return {
      imageUrl: input.imageUrl.trim() || undefined,
      textQuery,
    };
  }
  if (input.file) {
    const cropFile = activeCrop(input.mode, input.file, input.cropBlob);
    return cropFile
      ? { cropFile, textQuery }
      : { imageFile: input.file, textQuery };
  }
  return { textQuery };
}
