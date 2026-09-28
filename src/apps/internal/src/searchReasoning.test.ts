import { describe, expect, it } from 'vitest';
import {
  createSearchRequestContext,
  deriveRetrievalPlan,
  formatSearchReasoning,
  type SearchRequestContext,
  type SearchReasoningInput,
} from './searchReasoning';

function reason(
  request: SearchRequestContext,
  diagnostics: SearchReasoningInput = {},
): string {
  return formatSearchReasoning(request, diagnostics).paragraphs.join(' ');
}

describe('createSearchRequestContext', () => {
  it('classifies crop, upload, URL, and text-only requests', () => {
    expect(createSearchRequestContext({ cropFile: {}, textQuery: ' detail ' }))
      .toEqual({ mode: 'crop', textQuery: 'detail' });
    expect(createSearchRequestContext({ imageFile: {} }))
      .toEqual({ mode: 'upload', textQuery: null });
    expect(createSearchRequestContext({ imageUrl: ' https://example.test/image.jpg ' }))
      .toEqual({ mode: 'url', textQuery: null });
    expect(createSearchRequestContext({ textQuery: 'José Andrés' }))
      .toEqual({ mode: 'text', textQuery: 'José Andrés' });
  });
});

describe('formatSearchReasoning', () => {
  it('explains uploaded-image, URL, and crop searches', () => {
    expect(reason({ mode: 'upload', textQuery: null }))
      .toBe('This search used the uploaded image to find visually similar catalog assets.');
    expect(reason({ mode: 'url', textQuery: null }))
      .toBe('This search used the image URL to find visually similar catalog assets.');
    expect(reason({ mode: 'crop', textQuery: null }))
      .toBe(
        'This search used the selected area of the uploaded image to find visually similar catalog assets.',
      );
  });

  it('mentions text and ranking features only when diagnostics say they influenced results', () => {
    const copy = reason(
      { mode: 'upload', textQuery: 'green embroidered cap' },
      { hybridApplied: true, enrichmentApplied: true, semanticApplied: true },
    );
    expect(copy).toContain('text refinement “green embroidered cap” also influenced retrieval');
    expect(copy).toContain('interpreted into descriptive text and tags');
    expect(copy).toContain('Semantic ranking also reordered');

    const visualOnly = reason(
      { mode: 'upload', textQuery: null },
      { hybridApplied: false, enrichmentApplied: false, semanticApplied: false },
    );
    expect(visualOnly).not.toMatch(/text refinement|interpreted|Semantic ranking|Not Applied/i);
  });

  it('does not imply provided text influenced retrieval when hybrid was not applied', () => {
    expect(reason(
      { mode: 'url', textQuery: 'rosé été' },
      { hybridApplied: false },
    )).toContain(
      'The request included the text refinement “rosé été”, but diagnostics do not show it influencing retrieval.',
    );
  });

  it('explains text-only and recognized celebrity metadata searches', () => {
    const copy = reason(
      { mode: 'text', textQuery: 'José Andrés' },
      {
        celebrityName: 'José Andrés',
        celebrityIntentSource: 'text',
      },
    );
    expect(copy).toContain('text “José Andrés” matched an approved celebrity name');
    expect(copy).toContain('matched an approved celebrity name');
    expect(copy).toContain('retrieved from catalog metadata tagged with José Andrés');
    expect(copy).not.toMatch(/visually similar|visual search/i);
  });

  it.each([
    ['upload', 'the uploaded image'],
    ['crop', 'the selected area of the uploaded image'],
    ['url', 'the image URL'],
  ] as const)(
    'uses source-specific metadata-only reasoning for %s celebrity recognition',
    (mode, sourceCopy) => {
      const copy = reason(
        { mode, textQuery: null },
        { celebrityName: 'Ariana Grande', celebrityIntentSource: 'image' },
      );
      expect(copy).toContain(
        `Ariana Grande was recognized from ${sourceCopy} using allowlist-constrained recognition against the approved celebrity list.`,
      );
      expect(copy).toContain('Results were retrieved from catalog metadata tagged with Ariana Grande.');
      expect(copy).not.toMatch(/find visually similar|visual-similarity result|continued as a visual search/i);
      expect(copy).not.toMatch(/celebrityIntentSource|celebrityFilter|model version/i);
      expect(deriveRetrievalPlan(
        { mode, textQuery: null },
        { celebrityName: 'Ariana Grande', celebrityIntentSource: 'image' },
      )).toBe('celebrityMetadata');
    },
  );

  it('gives celebrity metadata precedence for image plus celebrity text', () => {
    const copy = reason(
      { mode: 'url', textQuery: 'Ariana Grande' },
      {
        celebrityName: 'Ariana Grande',
        celebrityIntentSource: 'text',
        hybridApplied: false,
      },
    );
    expect(copy).toContain('text “Ariana Grande” matched an approved celebrity name');
    expect(copy).toContain('retrieved from catalog metadata tagged with Ariana Grande');
    expect(copy).toContain('supplied image was not used for visual-similarity retrieval');
    expect(copy).not.toContain('image URL to find visually similar');
    expect(copy).not.toContain('diagnostics do not show it influencing retrieval');
  });

  it('explains normal visual fallback and actual hybrid retrieval without contradiction', () => {
    const visualFallback = reason(
      { mode: 'upload', textQuery: null },
      {
        celebrityRecognitionAttempted: true,
        celebrityFallbackReason: 'notRecognized',
      },
    );
    expect(visualFallback).toContain('results continued as a visual search');

    const hybrid = reason(
      { mode: 'crop', textQuery: 'green embroidered cap' },
      {
        hybridApplied: true,
        semanticApplied: true,
      },
    );
    expect(hybrid).toContain('selected area');
    expect(hybrid).toContain('text refinement “green embroidered cap” also influenced retrieval');
    expect(hybrid).toContain('Semantic ranking also reordered');
    expect(deriveRetrievalPlan(
      { mode: 'crop', textQuery: 'green embroidered cap' },
      { hybridApplied: true },
    )).toBe('hybrid');
  });

  it.each([
    ['upload', 'green cap', 'notRecognized'],
    ['url', 'rosé été', 'recognitionUnavailable'],
    ['crop', 'embroidered detail', 'futureRawFailureCode'],
  ] as const)(
    'uses hybrid fallback wording for %s plus text with celebrity reason %s',
    (mode, textQuery, celebrityFallbackReason) => {
      const copy = reason(
        { mode, textQuery },
        {
          hybridApplied: true,
          celebrityRecognitionAttempted: true,
          celebrityFallbackReason,
        },
      );

      expect(copy).toContain(`text refinement “${textQuery}” also influenced retrieval`);
      expect(copy).toContain('normal hybrid image-and-text retrieval');
      expect(copy).not.toContain('continued as a visual search');
      expect(copy).not.toContain(celebrityFallbackReason);
    },
  );

  it.each([
    ['notRecognized', 'no approved celebrity was recognized'],
    ['recognitionUnavailable', 'recognition was unavailable'],
  ] as const)(
    'keeps actual visual-only fallback truthful for %s',
    (celebrityFallbackReason, expectedReason) => {
      const copy = reason(
        { mode: 'url', textQuery: null },
        {
          celebrityRecognitionAttempted: true,
          celebrityFallbackReason,
        },
      );

      expect(copy).toContain(expectedReason);
      expect(copy).toContain('results continued as a visual search');
      expect(copy).not.toContain('hybrid image-and-text retrieval');
    },
  );

  it.each([
    ['notRecognized', 'no approved celebrity was recognized'],
    ['recognitionUnavailable', 'recognition was unavailable'],
    ['futureRawFailureCode', 'could not be completed'],
  ] as const)(
    'uses text fallback wording for text-only reason %s',
    (celebrityFallbackReason, expectedReason) => {
      const copy = reason(
        { mode: 'text', textQuery: 'José Andrés' },
        {
          celebrityRecognitionAttempted: true,
          celebrityFallbackReason,
        },
      );

      expect(copy).toContain(expectedReason);
      expect(copy).toContain('results continued as a text search');
      expect(copy).not.toContain('continued as a visual search');
      expect(copy).not.toContain('hybrid image-and-text retrieval');
      expect(copy).not.toContain(celebrityFallbackReason);
    },
  );

  it('uses generic fallback wording for partial unknown request diagnostics', () => {
    const rawReason = 'futurePartialFailure';
    const copy = formatSearchReasoning(
      undefined,
      {
        celebrityRecognitionAttempted: true,
        celebrityFallbackReason: rawReason,
      },
    ).paragraphs.join(' ');

    expect(copy).toContain('Celebrity recognition could not be completed');
    expect(copy).toContain('search continued without a celebrity match');
    expect(copy).not.toContain('visual search');
    expect(copy).not.toContain('hybrid image-and-text retrieval');
    expect(copy).not.toContain(rawReason);
  });

  it('handles partial and unknown future diagnostics without raw-code leakage or crashes', () => {
    const unknown = 'futureRawFailureCode';
    const result = formatSearchReasoning(
      { mode: 'crop', textQuery: null },
      {
        celebrityRecognitionAttempted: true,
        celebrityFallbackReason: unknown,
        generatedTags: { malformed: true },
      },
    );
    const copy = result.paragraphs.join(' ');
    expect(copy).toContain('Celebrity recognition could not be completed');
    expect(copy).not.toContain(unknown);
    expect(copy).not.toMatch(/model version|Not Generated|Not Applied/i);
    expect(() => formatSearchReasoning(undefined, undefined)).not.toThrow();
  });
});
