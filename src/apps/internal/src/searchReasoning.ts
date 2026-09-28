import {
  formatCelebrityReasoning,
  type CelebrityReasoningInput,
  type CelebrityReasoningState,
} from './celebrityReasoning';

export type SearchInputMode = 'upload' | 'url' | 'crop' | 'text';

export interface SearchRequestContext {
  mode: SearchInputMode;
  textQuery: string | null;
}

export interface SearchSource {
  imageUrl?: unknown;
  imageFile?: unknown;
  cropFile?: unknown;
  textQuery?: unknown;
}

export type SearchReasoningInput = CelebrityReasoningInput & {
  userText?: unknown;
  generatedCaption?: unknown;
  generatedTags?: unknown;
  hybridApplied?: unknown;
  semanticApplied?: unknown;
  enrichmentApplied?: unknown;
};

export interface SearchReasoning {
  paragraphs: string[];
  celebrityState: CelebrityReasoningState;
}

export type RetrievalPlan =
  | 'celebrityMetadata'
  | 'hybrid'
  | 'visual'
  | 'textMetadata'
  | 'unknown';

export function createSearchRequestContext(source: SearchSource): SearchRequestContext {
  const textQuery = normalizedString(source.textQuery);
  const mode = source.cropFile
    ? 'crop'
    : source.imageFile
      ? 'upload'
      : normalizedString(source.imageUrl)
        ? 'url'
        : 'text';
  return { mode, textQuery };
}

export function formatSearchReasoning(
  request?: SearchRequestContext | null,
  diagnostics?: SearchReasoningInput | null,
): SearchReasoning {
  const celebrity = formatCelebrityReasoning(diagnostics);
  const text = request?.textQuery ?? normalizedString(diagnostics?.userText);
  const plan = deriveRetrievalPlan(request, diagnostics, celebrity.state);
  const paragraphs: string[] = [];

  if (plan === 'celebrityMetadata') {
    paragraphs.push(celebrityMetadataReasoning(request, diagnostics, text, celebrity.text));
  } else if (plan === 'textMetadata') {
    paragraphs.push(text
      ? `This search used the text query “${text}” to search catalog metadata.`
      : 'This search used the available catalog metadata.');
  } else if (plan === 'visual' || plan === 'hybrid') {
    paragraphs.push(imageReasoning(request?.mode));
    if (text && plan === 'hybrid') {
      paragraphs.push(`The text refinement “${text}” also influenced retrieval.`);
    } else if (text) {
      paragraphs.push(
        `The request included the text refinement “${text}”, but diagnostics do not show it influencing retrieval.`,
      );
    }
    if (diagnostics?.enrichmentApplied === true && diagnostics?.hybridApplied === true) {
      paragraphs.push(
        'The image was interpreted into descriptive text and tags to support text-aware retrieval.',
      );
    }
    if (diagnostics?.semanticApplied === true) {
      paragraphs.push('Semantic ranking also reordered the text-aware candidate set.');
    }
  } else {
    paragraphs.push('This search used the available request signals to find catalog assets.');
  }

  if (plan !== 'celebrityMetadata' &&
      (celebrity.state === 'noMatch' || celebrity.state === 'unavailable')) {
    const fallbackReasoning = fallbackRetrievalReasoning(plan);
    paragraphs.push(fallbackReasoning
      ? `${celebrity.text} ${fallbackReasoning}`
      : celebrity.text);
  }

  return { paragraphs, celebrityState: celebrity.state };
}

export function deriveRetrievalPlan(
  request?: SearchRequestContext | null,
  diagnostics?: SearchReasoningInput | null,
  celebrityState: CelebrityReasoningState = formatCelebrityReasoning(diagnostics).state,
): RetrievalPlan {
  if (celebrityState === 'recognized' && normalizedString(diagnostics?.celebrityName)) {
    return 'celebrityMetadata';
  }
  if (request?.mode === 'text') {
    return 'textMetadata';
  }
  if (request?.mode === 'upload' || request?.mode === 'url' || request?.mode === 'crop') {
    return diagnostics?.hybridApplied === true ? 'hybrid' : 'visual';
  }
  return 'unknown';
}

function celebrityMetadataReasoning(
  request: SearchRequestContext | null | undefined,
  diagnostics: SearchReasoningInput | null | undefined,
  text: string | null,
  celebrityCopy: string,
): string {
  const name = normalizedString(diagnostics?.celebrityName);
  const resultCopy = name
    ? `Results were retrieved from catalog metadata tagged with ${name}.`
    : 'Results were retrieved from approved celebrity metadata.';

  if (diagnostics?.celebrityIntentSource === 'image') {
    const sourceCopy = imageRecognitionSource(request?.mode);
    const recognitionCopy = name
      ? `${name} was recognized from ${sourceCopy} using allowlist-constrained recognition against the approved celebrity list.`
      : celebrityCopy;
    return `${recognitionCopy} ${resultCopy}`;
  }
  if (diagnostics?.celebrityIntentSource === 'text') {
    const queryCopy = text
      ? `The text “${text}” matched an approved celebrity name.`
      : celebrityCopy;
    const imageCopy = request?.mode === 'upload' || request?.mode === 'url' || request?.mode === 'crop'
      ? ' The supplied image was not used for visual-similarity retrieval.'
      : '';
    return `${queryCopy} ${resultCopy}${imageCopy}`;
  }
  return `${celebrityCopy} ${resultCopy}`;
}

function imageRecognitionSource(mode: SearchInputMode | undefined): string {
  switch (mode) {
    case 'crop':
      return 'the selected area of the uploaded image';
    case 'url':
      return 'the image URL';
    case 'upload':
      return 'the uploaded image';
    default:
      return 'the supplied image';
  }
}

function imageReasoning(mode: SearchInputMode | undefined): string {
  switch (mode) {
    case 'crop':
      return 'This search used the selected area of the uploaded image to find visually similar catalog assets.';
    case 'url':
      return 'This search used the image URL to find visually similar catalog assets.';
    case 'upload':
      return 'This search used the uploaded image to find visually similar catalog assets.';
    case 'text':
      return 'This search used catalog metadata.';
    default:
      return 'This search used the available request signals to find catalog assets.';
  }
}

function fallbackRetrievalReasoning(plan: RetrievalPlan): string | null {
  switch (plan) {
    case 'hybrid':
      return 'The results continued with normal hybrid image-and-text retrieval.';
    case 'visual':
      return 'The results continued as a visual search.';
    case 'textMetadata':
      return 'The results continued as a text search.';
    default:
      return null;
  }
}

function normalizedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
