import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReasoningPanel } from './ReasoningPanel';

describe('ReasoningPanel', () => {
  it('renders request-specific prose without noisy unused rows', () => {
    const html = renderToStaticMarkup(
      <ReasoningPanel
        request={{ mode: 'upload', textQuery: 'navy' }}
        interpretation={{ userText: 'navy', hybridApplied: true }}
      />,
    );

    expect(html).toContain('Reasoning');
    expect(html).toContain('uploaded image');
    expect(html).toContain('text refinement');
    expect(html).not.toContain('Not generated');
    expect(html).not.toContain('Not applied');
    expect(html).not.toContain('<dl');
  });

  it('renders partial and unknown future diagnostics safely and hides the raw code', () => {
    const rawReason = 'futureSafeFailure';
    const html = renderToStaticMarkup(
      <ReasoningPanel
        request={{ mode: 'url', textQuery: null }}
        interpretation={{
          celebrityRecognitionAttempted: true,
          celebrityFallbackReason: rawReason,
          generatedTags: { malformed: true },
        }}
      />,
    );

    expect(html).toContain('Celebrity recognition could not be completed');
    expect(html).not.toContain(rawReason);
    expect(html).not.toMatch(/model version|Not generated|Not applied/i);
  });

  it('renders celebrity metadata-only image reasoning without visual claims', () => {
    const html = renderToStaticMarkup(
      <ReasoningPanel
        request={{ mode: 'upload', textQuery: 'Ariana Grande' }}
        interpretation={{
          celebrityName: 'Ariana Grande',
          celebrityIntentSource: 'text',
          hybridApplied: false,
        }}
      />,
    );

    expect(html).toContain('retrieved from catalog metadata tagged with Ariana Grande');
    expect(html).toContain('not used for visual-similarity retrieval');
    expect(html).not.toContain('find visually similar catalog assets');
    expect(html).not.toContain('diagnostics do not show it influencing retrieval');
  });

  it.each([
    ['upload', 'the uploaded image'],
    ['crop', 'the selected area of the uploaded image'],
    ['url', 'the image URL'],
  ] as const)(
    'renders both recognition and metadata retrieval steps for %s image recognition',
    (mode, sourceCopy) => {
      const html = renderToStaticMarkup(
        <ReasoningPanel
          request={{ mode, textQuery: null }}
          interpretation={{
            celebrityName: 'Ariana Grande',
            celebrityIntentSource: 'image',
            celebrityRecognitionAttempted: true,
            celebrityRecognitionConfidence: 0.99,
            celebrityRecognitionModelVersion: '2024-11-20',
          }}
        />,
      );

      expect(html).toContain(
        `Ariana Grande was recognized from ${sourceCopy} using allowlist-constrained recognition against the approved celebrity list.`,
      );
      expect(html).toContain(
        'Results were retrieved from catalog metadata tagged with Ariana Grande.',
      );
      expect(html).not.toMatch(/find visually similar|visual-similarity result|continued as a visual search/i);
      expect(html).not.toMatch(/0\.99|2024-11-20|celebrityRecognition/i);
    },
  );

  it('renders hybrid celebrity fallback without contradicting the retrieval plan', () => {
    const html = renderToStaticMarkup(
      <ReasoningPanel
        request={{ mode: 'url', textQuery: 'green cap' }}
        interpretation={{
          hybridApplied: true,
          celebrityRecognitionAttempted: true,
          celebrityFallbackReason: 'notRecognized',
        }}
      />,
    );

    expect(html).toContain('text refinement');
    expect(html).toContain('normal hybrid image-and-text retrieval');
    expect(html).not.toContain('continued as a visual search');
  });

  it('renders absent diagnostics and context at the component boundary', () => {
    const html = renderToStaticMarkup(
      <ReasoningPanel interpretation={undefined} request={undefined} />,
    );

    expect(html).toContain('available request signals');
    expect(html).toContain('aria-label="Reasoning about this search"');
  });
});
