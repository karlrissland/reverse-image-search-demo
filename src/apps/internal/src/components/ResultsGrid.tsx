import type { InternalResult } from '../types';
import { getSimilarityQuality } from '../similarityQuality';

interface ResultsGridProps {
  results: InternalResult[];
}

function similarityLabel(result: InternalResult): string {
  if (result.score != null) return `Similarity ${(result.score * 100).toFixed(1)}%`;
  return '—';
}

export function ResultsGrid({ results }: ResultsGridProps) {
  if (results.length === 0) {
    return <p className="empty">No results yet. Upload an image or paste a URL to search.</p>;
  }

  return (
    <div className="grid">
      {results.map((r, index) => (
        <ResultCard key={r.assetId} result={r} index={index} />
      ))}
    </div>
  );
}

function ResultCard({ result: r, index }: { result: InternalResult; index: number }) {
  const quality = getSimilarityQuality(r.score);

  return (
    <article className={`card quality-${quality.key}`}>
      <div className="card-image">
        {r.imageUrl ? (
          <img src={r.imageUrl} alt={r.caption ?? r.assetId} loading="lazy" />
        ) : (
          <div className="no-image">No image</div>
        )}
        <span
          className={`similarity similarity-${quality.key}`}
          title="Relative nearest-neighbor similarity, not calibrated confidence"
        >
          <span className="quality-label">{quality.label}</span>
          <span>{similarityLabel(r)}</span>
        </span>
        {r.public === false && <span className="badge unpublished">unpublished</span>}
        <span className="result-index" aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
        </span>
      </div>

      <div className="card-body">
        <div className="card-title">
          <div>
            <span className="card-kicker">
              {[r.category, r.collection].filter(Boolean).join(' · ') || 'Catalog asset'}
            </span>
            <span className="asset-id">{r.assetId}</span>
          </div>
          {r.celebrity && (
            <span className="badge celebrity" title={r.celebritySource ?? undefined}>
              ★ {r.celebrity}
            </span>
          )}
        </div>
        {r.caption && <p className="caption">{r.caption}</p>}

        <dl className="meta">
          <Meta label="Category" value={r.category} />
          <Meta label="Subcategory" value={r.subcategory} />
          <Meta label="Collection" value={r.collection} />
          <Meta label="Color" value={r.color} />
          <Meta label="Season" value={r.season} />
        </dl>

        {r.tags.length > 0 && (
          <div className="tags">
            {r.tags.map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
          </div>
        )}

        <details className="provenance">
          <summary>Provenance</summary>
          <dl className="meta">
            <Meta label="Blob path" value={r.blobPath} />
            <Meta label="Embedding model" value={r.embeddingModelVersion} />
            <Meta label="Metadata version" value={r.metadataVersion} />
            <Meta label="Corpus enrichment model" value={r.enrichmentModel} />
            <Meta label="Celebrity source" value={r.celebritySource} />
            <Meta label="Indexed at" value={r.indexedAt} />
            <Meta
              label="Raw similarity score"
              value={r.score != null ? r.score.toFixed(4) : null}
            />
            <Meta
              label="Hybrid RRF score"
              value={r.hybridScore != null ? r.hybridScore.toFixed(4) : null}
            />
            <Meta
              label="Semantic reranker score"
              value={
                r.semanticRerankerScore != null ? r.semanticRerankerScore.toFixed(4) : null
              }
            />
          </dl>
        </details>
      </div>
    </article>
  );
}

function Meta({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
