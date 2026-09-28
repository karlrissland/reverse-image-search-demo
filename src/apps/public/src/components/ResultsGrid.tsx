import type { PublicResult } from '../types';

interface ResultsGridProps {
  results: PublicResult[];
}

export function ResultsGrid({ results }: ResultsGridProps) {
  return (
    <div className="results-grid">
      {results.map((item, index) => (
        <article key={item.assetId} className="card">
          <div className="card-image">
            {item.imageUrl ? (
              <img src={item.imageUrl} alt={item.caption ?? item.assetId} loading="lazy" />
            ) : (
              <div className="card-image-missing">No image</div>
            )}
            <span className="result-index" aria-hidden="true">
              {String(index + 1).padStart(2, '0')}
            </span>
          </div>
          <div className="card-body">
            <p className="card-kicker">
              {[item.category, item.collection].filter(Boolean).join(' · ') || 'Catalog match'}
            </p>
            {item.caption && <p className="card-caption">{item.caption}</p>}
            <dl className="card-meta">
              {item.category && (
                <div>
                  <dt>Category</dt>
                  <dd>{item.subcategory ? `${item.category} · ${item.subcategory}` : item.category}</dd>
                </div>
              )}
              {(item.color || item.season) && (
                <div>
                  <dt>Details</dt>
                  <dd>{[item.color, item.season].filter(Boolean).join(' · ')}</dd>
                </div>
              )}
            </dl>
            {item.tags.length > 0 && (
              <ul className="tag-list">
                {item.tags.slice(0, 8).map((tag) => (
                  <li key={tag}>{tag}</li>
                ))}
              </ul>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
