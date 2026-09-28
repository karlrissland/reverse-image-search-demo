import { describe, expect, it } from 'vitest';
import {
  formatCelebrityReasoning,
  type CelebrityReasoningInput,
} from './celebrityReasoning';

function interpretation(overrides: CelebrityReasoningInput = {}): CelebrityReasoningInput {
  return overrides;
}

describe('formatCelebrityReasoning', () => {
  it('formats recognized text and image states', () => {
    expect(formatCelebrityReasoning(interpretation({
      celebrityName: 'Ariana Grande',
      celebrityIntentSource: 'text',
    }))).toEqual({
      state: 'recognized',
      text: 'Ariana Grande matched an approved celebrity name in the query.',
    });
    expect(formatCelebrityReasoning(interpretation({
      celebrityName: 'Cate Blanchett',
      celebrityIntentSource: 'image',
    }))).toEqual({
      state: 'recognized',
      text: 'Cate Blanchett was recognized from the approved celebrity list.',
    });
  });

  it.each([undefined, null, '', '   '])(
    'treats absent or empty fallback %s as not used when recognition was not attempted',
    fallback => {
      expect(formatCelebrityReasoning(interpretation({
        celebrityFallbackReason: fallback,
      }))).toEqual({
        state: 'notUsed',
        text: 'Celebrity recognition was not used for this query.',
      });
    },
  );

  it.each(['notRecognized', 'nonAllowlistedOutput', 'lowConfidence'])(
    'formats known no-match reason %s without exposing the raw code',
    fallback => {
      const result = formatCelebrityReasoning(interpretation({
        celebrityRecognitionAttempted: true,
        celebrityFallbackReason: fallback,
      }));
      expect(result.state).toBe('noMatch');
      expect(result.text).toBe(
        'Celebrity recognition was tried, but no approved celebrity was recognized.',
      );
      expect(result.text).not.toContain(fallback);
    },
  );

  it.each([
    'allowlistUnavailable',
    'allowlistEmpty',
    'recognitionUnavailable',
    'invalidModelOutput',
  ])('formats known safe failure %s without exposing the raw code', fallback => {
    const result = formatCelebrityReasoning(interpretation({
      celebrityRecognitionAttempted: true,
      celebrityFallbackReason: fallback,
    }));
    expect(result.state).toBe('unavailable');
    expect(result.text).toBe(
      'Celebrity recognition was unavailable, so the search continued without a celebrity match.',
    );
    expect(result.text).not.toContain(fallback);
  });

  it('fails safe for an arbitrary future reason after an attempt', () => {
    const rawReason = 'futureSafeFailure';
    const result = formatCelebrityReasoning(interpretation({
      celebrityRecognitionAttempted: true,
      celebrityFallbackReason: rawReason,
    }));

    expect(result).toEqual({
      state: 'unavailable',
      text: 'Celebrity recognition could not be completed, so the search continued without a celebrity match.',
    });
    expect(result.text).not.toContain(rawReason);
  });

  it('does not imply an attempt for an unknown reason when attempted is absent', () => {
    const result = formatCelebrityReasoning(interpretation({
      celebrityFallbackReason: 'futureSafeFailure',
    }));

    expect(result).toEqual({
      state: 'notUsed',
      text: 'Celebrity recognition was not used for this query.',
    });
  });

  it('returns a valid state for missing and partial diagnostics', () => {
    expect(formatCelebrityReasoning()).toEqual({
      state: 'notUsed',
      text: 'Celebrity recognition was not used for this query.',
    });
    expect(formatCelebrityReasoning({ celebrityRecognitionAttempted: true })).toEqual({
      state: 'noMatch',
      text: 'Celebrity recognition was tried, but no approved celebrity was recognized.',
    });
  });
});
