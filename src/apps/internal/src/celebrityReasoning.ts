import type { QueryInterpretation } from './types';

export type CelebrityReasoningState = 'recognized' | 'notUsed' | 'noMatch' | 'unavailable';

export interface CelebrityReasoning {
  state: CelebrityReasoningState;
  text: string;
}

export type CelebrityReasoningInput =
  Partial<Omit<QueryInterpretation, 'celebrityFallbackReason' | 'generatedTags'>> & {
    celebrityFallbackReason?: unknown;
    generatedTags?: unknown;
  };

export function formatCelebrityReasoning(
  interpretation?: CelebrityReasoningInput | null,
): CelebrityReasoning {
  const celebrityName = normalizedString(interpretation?.celebrityName);
  if (celebrityName) {
    return {
      state: 'recognized',
      text: interpretation?.celebrityIntentSource === 'text'
        ? `${celebrityName} matched an approved celebrity name in the query.`
        : `${celebrityName} was recognized from the approved celebrity list.`,
    };
  }

  const attempted = interpretation?.celebrityRecognitionAttempted === true;
  const fallbackReason = normalizedString(interpretation?.celebrityFallbackReason);
  switch (fallbackReason) {
    case 'notRecognized':
    case 'nonAllowlistedOutput':
    case 'lowConfidence':
      return {
        state: 'noMatch',
        text: 'Celebrity recognition was tried, but no approved celebrity was recognized.',
      };
    case 'allowlistUnavailable':
    case 'allowlistEmpty':
    case 'recognitionUnavailable':
    case 'invalidModelOutput':
      return {
        state: 'unavailable',
        text: 'Celebrity recognition was unavailable, so the search continued without a celebrity match.',
      };
    case null:
      return attempted ? noMatch() : notUsed();
    default:
      return attempted
        ? {
            state: 'unavailable',
            text: 'Celebrity recognition could not be completed, so the search continued without a celebrity match.',
          }
        : notUsed();
  }
}

function normalizedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function noMatch(): CelebrityReasoning {
  return {
    state: 'noMatch',
    text: 'Celebrity recognition was tried, but no approved celebrity was recognized.',
  };
}

function notUsed(): CelebrityReasoning {
  return {
    state: 'notUsed',
    text: 'Celebrity recognition was not used for this query.',
  };
}
