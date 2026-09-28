import {
  formatSearchReasoning,
  type SearchReasoningInput,
  type SearchRequestContext,
} from '../searchReasoning';

interface ReasoningPanelProps {
  interpretation?: SearchReasoningInput | null;
  request?: SearchRequestContext | null;
}

export function ReasoningPanel({ interpretation, request }: ReasoningPanelProps) {
  const reasoning = formatSearchReasoning(request, interpretation);

  return (
    <details className="query-diagnostics" aria-label="Reasoning about this search">
      <summary>Reasoning</summary>
      <div className={`reasoning-copy celebrity-reasoning-${reasoning.celebrityState}`}>
        {reasoning.paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
    </details>
  );
}
