import { useState } from 'react';
import type { Facets, FilterMap } from '../types';

interface FacetPanelProps {
  facets: Facets;
  selected: FilterMap;
  onToggle: (field: string, value: string) => void;
  onClear: () => void;
}

const FACET_ORDER = ['category', 'color', 'season', 'collection', 'tags'];
const LABELS: Record<string, string> = {
  category: 'Category',
  color: 'Color',
  season: 'Season',
  collection: 'Collection',
  tags: 'Tags',
};

export function FacetPanel({ facets, selected, onToggle, onClear }: FacetPanelProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const fields = FACET_ORDER.filter((field) => facets[field]?.length);
  const selectedCount = Object.values(selected).reduce((total, values) => total + values.length, 0);

  if (fields.length === 0) return null;

  return (
    <aside className={mobileOpen ? 'facets mobile-open' : 'facets'} aria-label="Filter diagnostic results">
      <button
        type="button"
        className="mobile-filter-toggle"
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((open) => !open)}
      >
        Filter results {selectedCount > 0 && <span>{selectedCount}</span>}
      </button>
      <div className="facet-content">
        <div className="facets-header">
          <div>
            <span className="eyebrow">Results</span>
            <h2>Refine matches</h2>
          </div>
          {selectedCount > 0 && (
            <button type="button" className="link-button" onClick={onClear}>Clear all</button>
          )}
        </div>
        {fields.map((field) => (
          <details key={field} className="facet-group" open>
            <summary>{LABELS[field] ?? field}</summary>
            <ul>
              {facets[field].map((entry) => {
                const isSelected = selected[field]?.includes(entry.value) ?? false;
                return (
                  <li key={entry.value}>
                    <label className={isSelected ? 'facet selected' : 'facet'}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggle(field, entry.value)}
                      />
                      <span className="facet-value">{entry.value}</span>
                      <span className="facet-count">{entry.count}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </details>
        ))}
      </div>
    </aside>
  );
}
