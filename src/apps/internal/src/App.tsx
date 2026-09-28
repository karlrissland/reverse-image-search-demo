import { useCallback, useRef, useState } from 'react';
import { searchInternal } from './api';
import { API_BASE_URL } from './config';
import { brand } from './branding';
import { FacetPanel } from './components/FacetPanel';
import { ResultsGrid } from './components/ResultsGrid';
import { ReasoningPanel } from './components/ReasoningPanel';
import { SearchPanel } from './components/SearchPanel';
import {
  createSearchRequestContext,
  type SearchRequestContext,
} from './searchReasoning';
import type {
  Facets,
  FilterMap,
  InternalResult,
  MatchState,
  QueryInterpretation,
} from './types';

type QuerySource = { imageUrl?: string; imageFile?: Blob; cropFile?: Blob; textQuery?: string };

export function App() {
  const [top, setTop] = useState(10);
  const [filters, setFilters] = useState<FilterMap>({});
  const [results, setResults] = useState<InternalResult[]>([]);
  const [facets, setFacets] = useState<Facets>({});
  const [matchState, setMatchState] = useState<MatchState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [queryInterpretation, setQueryInterpretation] = useState<QueryInterpretation | null>(null);
  const [requestContext, setRequestContext] = useState<SearchRequestContext | null>(null);
  const lastSource = useRef<QuerySource | null>(null);

  const runSearch = useCallback(
    async (source: QuerySource, activeFilters: FilterMap, activeTop: number) => {
      lastSource.current = source;
      setLoading(true);
      setError(null);
      try {
        const response = await searchInternal({ ...source, top: activeTop, filters: activeFilters });
        setResults(response.results);
        setFacets(response.facets ?? {});
        setMatchState(response.matchState);
        setQueryInterpretation(response.queryInterpretation ?? null);
        setRequestContext(createSearchRequestContext(source));
        setSearched(true);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Search failed.');
        setResults([]);
        setMatchState(null);
        setQueryInterpretation(null);
        setRequestContext(null);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const onSearch = (source: QuerySource) => void runSearch(source, filters, top);

  const toggleFacet = (field: string, value: string) => {
    const current = filters[field] ?? [];
    const next = current.includes(value)
      ? current.filter((candidate) => candidate !== value)
      : [...current, value];
    const nextFilters = { ...filters, [field]: next };
    setFilters(nextFilters);
    if (lastSource.current) void runSearch(lastSource.current, nextFilters, top);
  };

  const clearFacets = () => {
    setFilters({});
    if (lastSource.current) void runSearch(lastSource.current, {}, top);
  };

  return (
    <div className="app">
      <header className="app-header">
        <a className="brand-lockup" href="#top" aria-label={brand.homeAriaLabel}>
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

      <section className="hero" id="top" aria-label="Internal visual search">
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
        <div className="layout">
          <FacetPanel facets={facets} selected={filters} onToggle={toggleFacet} onClear={clearFacets} />
          <main className="content" id="results">
          <div className="content-heading">
            <div>
              <span className="eyebrow">Primary screen</span>
              <h2>
                {searched && queryInterpretation?.celebrityName
                  ? `${results.length} assets tagged with ${queryInterpretation.celebrityName}`
                  : searched && matchState === 'matches'
                    ? `${results.length} visually similar assets`
                    : 'Catalog results'}
              </h2>
            </div>
            {searched && matchState && (
              <span className={`match-state ${matchState}`}>
                {matchState === 'matches' ? 'Match set' : 'Diagnostic only'}
              </span>
            )}
          </div>

          <div className="status-region" aria-live="polite" aria-atomic="true">
            {error && (
              <div className="error" role="alert">
                <strong>We couldn’t complete this catalog search.</strong>
                <span>Try again in a moment or choose another image. {error}</span>
              </div>
            )}
            {loading && (
              <div className="loading-state" role="status">
                <div className="progress-line" />
                <p>Finding and ranking the strongest visual matches…</p>
                <div className="skeleton-grid" aria-hidden="true">
                  {[0, 1, 2].map((item) => <div className="skeleton-card" key={item} />)}
                </div>
              </div>
            )}
          </div>

          {searched && (
            <ReasoningPanel
              interpretation={queryInterpretation}
              request={requestContext}
            />
          )}

          {searched ? (
            matchState === 'noStrongMatch' ? (
              <section className="no-strong-match">
                <span className="state-icon" aria-hidden="true">◇</span>
                <span className="eyebrow">No strong match</span>
                <h2>We couldn’t find a close match in this catalog.</h2>
                <p>Try a clearer product image, crop around one item, or add a color, category, or silhouette. Weak nearest candidates remain available for internal review.</p>
                <details className="weak-results">
                  <summary>Review weak nearest candidates ({results.length})</summary>
                  <p className="diagnostic-note">Retained for diagnostic review only. These candidates should not be treated as matches.</p>
                  <ResultsGrid results={results} />
                </details>
              </section>
            ) : (
              <ResultsGrid results={results} />
            )
          ) : (
            <div className="empty-state">
              <span className="state-icon" aria-hidden="true">↗</span>
              <span className="eyebrow">Inspire before asking</span>
              <h2>Start with a visual reference.</h2>
              <p>Choose a campaign, product, or street-style image. Crop to the silhouette, texture, or detail that matters.</p>
            </div>
          )}
          </main>
        </div>
      </section>
      <p className="footer-note">{brand.footerNote} API: {API_BASE_URL || 'same origin'}.</p>
    </div>
  );
}
