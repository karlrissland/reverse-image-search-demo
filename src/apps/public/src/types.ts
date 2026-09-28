export interface PublicResult {
  assetId: string;
  imageUrl: string | null;
  caption: string | null;
  tags: string[];
  category: string | null;
  subcategory: string | null;
  collection: string | null;
  color: string | null;
  season: string | null;
}

export interface FacetEntry {
  value: string;
  count: number;
}

export type Facets = Record<string, FacetEntry[]>;

export type MatchState = 'matches' | 'noStrongMatch';

export interface SearchResponse {
  matchState: MatchState;
  results: PublicResult[];
  facets: Facets;
}

export type FilterMap = Record<string, string[]>;

export interface SearchRequest {
  imageUrl?: string;
  imageFile?: Blob;
  cropFile?: Blob;
  textQuery?: string;
  top: number;
  filters: FilterMap;
}
