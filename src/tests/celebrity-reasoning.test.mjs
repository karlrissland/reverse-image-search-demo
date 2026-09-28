import assert from 'node:assert/strict';
import test from 'node:test';
import { formatCelebrityReasoning } from '../apps/internal/src/celebrityReasoning.ts';

function interpretation(overrides = {}) {
  return {
    userText: null,
    generatedCaption: null,
    generatedTags: [],
    effectiveText: null,
    hybridApplied: false,
    semanticApplied: false,
    enrichmentApplied: false,
    enrichmentModelVersion: null,
    celebrityName: null,
    celebrityIntentSource: null,
    celebrityFilter: null,
    celebrityRecognitionAttempted: false,
    celebrityRecognitionConfidence: null,
    celebrityRecognitionModelVersion: null,
    celebrityFallbackReason: null,
    ...overrides,
  };
}

test('recognized image celebrity references the approved list', () => {
  assert.deepEqual(
    formatCelebrityReasoning(interpretation({
      celebrityName: 'Ariana Grande',
      celebrityIntentSource: 'image',
      celebrityRecognitionAttempted: true,
    })),
    {
      state: 'recognized',
      text: 'Ariana Grande was recognized from the approved celebrity list.',
    },
  );
});

test('recognized text celebrity explains the approved query match', () => {
  assert.deepEqual(
    formatCelebrityReasoning(interpretation({
      celebrityName: "Lupita Nyong'o",
      celebrityIntentSource: 'text',
    })),
    {
      state: 'recognized',
      text: "Lupita Nyong'o matched an approved celebrity name in the query.",
    },
  );
});

test('unused recognition is explicit', () => {
  assert.deepEqual(formatCelebrityReasoning(interpretation()), {
    state: 'notUsed',
    text: 'Celebrity recognition was not used for this query.',
  });
});

for (const celebrityFallbackReason of ['notRecognized', 'nonAllowlistedOutput', 'lowConfidence']) {
  test(`${celebrityFallbackReason} becomes an approved-list no-match explanation`, () => {
    const result = formatCelebrityReasoning(interpretation({
      celebrityRecognitionAttempted: true,
      celebrityFallbackReason,
    }));

    assert.equal(result.state, 'noMatch');
    assert.equal(
      result.text,
      'Celebrity recognition was tried, but no approved celebrity was recognized.',
    );
    assert.doesNotMatch(result.text, new RegExp(celebrityFallbackReason, 'i'));
  });
}

for (const celebrityFallbackReason of [
  'allowlistUnavailable',
  'allowlistEmpty',
  'recognitionUnavailable',
  'invalidModelOutput',
]) {
  test(`${celebrityFallbackReason} becomes a safe-unavailable explanation`, () => {
    const result = formatCelebrityReasoning(interpretation({
      celebrityRecognitionAttempted: celebrityFallbackReason !== 'allowlistUnavailable',
      celebrityFallbackReason,
    }));

    assert.equal(result.state, 'unavailable');
    assert.equal(
      result.text,
      'Celebrity recognition was unavailable, so the search continued without a celebrity match.',
    );
    assert.doesNotMatch(result.text, new RegExp(celebrityFallbackReason, 'i'));
  });
}

test('attempted recognition without a raw reason still fails closed as no match', () => {
  assert.deepEqual(
    formatCelebrityReasoning(interpretation({ celebrityRecognitionAttempted: true })),
    {
      state: 'noMatch',
      text: 'Celebrity recognition was tried, but no approved celebrity was recognized.',
    },
  );
});
