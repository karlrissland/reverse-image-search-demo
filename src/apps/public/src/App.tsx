import { useCallback, useRef, useState } from 'react';
import { searchPublic } from './api';
import { API_BASE_URL } from './config';
import { brand } from './branding';
import { FacetPanel } from './components/FacetPanel';
import { ResultsGrid } from './components/ResultsGrid';
import { SearchPanel } from './components/SearchPanel';
import type { Facets, FilterMap, MatchState, PublicResult } from './types';

type QuerySource = { imageUrl?: string; imageFile?: Blob; cropFile?: Blob; textQuery?: string };

export function App() {
  const [top, setTop] = useState(12);
  const [filters, setFilters] = useState<FilterMap>({});
  const [results, setResults] = useState<PublicResult[]>([]);
  const [facets, setFacets] = useState<Facets>({});
  const [matchState, setMatchState] = useState<MatchState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const lastSource = useRef<QuerySource | null>(null);

  const runSearch = useCallback(
    async (source: QuerySource, nextFilters: FilterMap, nextTop: number) => {
      lastSource.current = source;
      setLoading(true);
      setError(null);
      try {
        const response = await searchPublic({ ...source, top: nextTop, filters: nextFilters });
        setResults(response.results);
        setFacets(response.facets);
        setMatchState(response.matchState);
        setSearched(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed.');
        setResults([]);
        setFacets({});
        setMatchState(null);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const onSearch = (source: QuerySource) => {
    setFilters({});
    void runSearch(source, {}, top);
  };

  const toggleFacet = (field: string, value: string) => {
    if (!lastSource.current) return;
    const current = filters[field] ?? [];
    const next = current.includes(value)
      ? current.filter((candidate) => candidate !== value)
      : [...current, value];
    const nextFilters = { ...filters, [field]: next };
    setFilters(nextFilters);
    void runSearch(lastSource.current, nextFilters, top);
  };

  const clearFacets = () => {
    if (!lastSource.current) return;
    setFilters({});
    void runSearch(lastSource.current, {}, top);
  };

  return (
    <div className="app">
      <header className="app-header">
        <a className="brand" href="#top" aria-label={brand.homeAriaLabel}>
          <span className="brand-name">{brand.name}</span>
        </a>
        <nav className="header-nav" aria-label="Primary">
          <a href="#results">Men</a>
          <a href="#results">Women</a>
          <a href="#results">Kids &amp; Baby</a>
          <a href="#results">Home</a>
          <a href="#results">Discover</a>
          <a href="#results">Sale</a>
        </nav>
        <div className="header-actions" aria-label="Utility actions">
          <span aria-hidden="true">⌕</span>
          <span aria-hidden="true">♡</span>
          <span aria-hidden="true">▢</span>
        </div>
      </header>

      <section className="hero" id="top" aria-label="Visual search">
        <div className="campaign">
          <div className="hero-content">
            <div className="headline">
              <span className="eyebrow">{brand.tagline}</span>
              <h1>{brand.heroTitle}</h1>
              <p>{brand.heroSubtitle}</p>
              <div className="hero-ctas">
                <a className="hero-button primary-action" href="#search">Explore matches</a>
                <a className="hero-button secondary-action" href="#results">Results experience</a>
              </div>
            </div>
            <SearchPanel top={top} onTopChange={setTop} loading={loading} onSearch={onSearch} />
          </div>
        </div>
      </section>

      <section className="showcase" id="search">
        <div className="section-title">
          <span className="eyebrow">Visual discovery</span>
          <h2>Designed for discovery.</h2>
          <p>Search by image, focus on the detail that matters, and refine the strongest catalog matches.</p>
        </div>
        <div className="layout">
          <FacetPanel
            facets={facets}
            selected={filters}
            onToggle={toggleFacet}
            onClear={clearFacets}
          />
          <main className="content" id="results">
          <div className="content-heading">
            <div>
              <span className="eyebrow">Primary screen</span>
              <h2>{searched && matchState === 'matches' ? `${results.length} visually similar assets` : 'Your visual edit'}</h2>
              <p>{searched && matchState === 'matches' ? 'Strongest visual matches first. Refine by category, collection, color, season, or detail.' : 'Your strongest catalog matches will appear here.'}</p>
            </div>
            {API_BASE_URL && <span className="api-origin">Connected</span>}
          </div>

          <div className="status-region" aria-live="polite" aria-atomic="true">
            {error && (
              <div className="error" role="alert">
                <strong>We couldn’t find the look just now.</strong>
                <span>Try again in a moment or choose another image. {error}</span>
              </div>
            )}
            {loading && (
              <div className="loading-state" role="status">
                <div className="progress-line" />
                <p>Finding the strongest visual matches…</p>
                <div className="skeleton-grid" aria-hidden="true">
                  {[0, 1, 2].map((item) => <div className="skeleton-card" key={item} />)}
                </div>
              </div>
            )}
          </div>

          {!loading && searched && matchState === 'noStrongMatch' && !error && (
            <div className="no-strong-match">
              <span className="state-icon" aria-hidden="true">◇</span>
              <span className="eyebrow">No strong match</span>
              <h2>We couldn’t find a close match in this catalog.</h2>
              <p>Try a clearer product image, crop around one item, or add a color, category, or silhouette.</p>
            </div>
          )}
          {!loading && searched && matchState !== 'noStrongMatch' && results.length === 0 && !error && (
            <div className="empty-state">
              <span className="state-icon" aria-hidden="true">○</span>
              <h2>No matches in this edit.</h2>
              <p>Clear a filter or try another image to discover more of the catalog.</p>
            </div>
          )}
          {!loading && !searched && !error && (
            <div className="empty-state">
              <span className="state-icon" aria-hidden="true">↗</span>
              <span className="eyebrow">Inspire before asking</span>
              <h2>Start with a visual reference.</h2>
              <p>Choose a campaign, product, or street-style image. Crop to the silhouette, texture, or detail that matters.</p>
              <div className="example-chips" aria-label="Example refinements">
                <span>Blue knit</span>
                <span>Leather detail</span>
                <span>Summer tailoring</span>
              </div>
            </div>
          )}
          {!loading && matchState === 'matches' && results.length > 0 && <ResultsGrid results={results} />}
          </main>
        </div>
      </section>
      <p className="footer-note">{brand.footerNote}</p>
    </div>
  );
}
