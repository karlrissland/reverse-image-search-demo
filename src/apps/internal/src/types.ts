export interface InternalResult {
  assetId: string;
  imageUrl: string | null;
  caption: string | null;
  tags: string[];
  category: string | null;
  subcategory: string | null;
  collection: string | null;
  color: string | null;
  season: string | null;
  // Internal-only provenance and diagnostics.
  score: number | null;
  confidence: number | null;
  celebrity: string | null;
  celebritySource: string | null;
  public: boolean | null;
  blobPath: string | null;
  metadataVersion: string | null;
  embeddingModelVersion: string | null;
  enrichmentModel: string | null;
  indexedAt: string | null;
  hybridScore: number | null;
  semanticRerankerScore: number | null;
}

export interface FacetEntry {
  value: string;
  count: number;
}

export type Facets = Record<string, FacetEntry[]>;

export type MatchState = 'matches' | 'noStrongMatch';

export interface SearchResponse {
  matchState: MatchState;
  results: InternalResult[];
  facets: Facets;
  queryInterpretation?: QueryInterpretation | null;
}

export interface QueryInterpretation {
  userText: string | null;
  generatedCaption: string | null;
  generatedTags: string[];
  effectiveText: string | null;
  hybridApplied: boolean;
  semanticApplied: boolean;
  enrichmentApplied: boolean;
  enrichmentModelVersion: string | null;
  celebrityName: string | null;
  celebrityIntentSource: 'text' | 'image' | null;
  celebrityFilter: string | null;
  celebrityRecognitionAttempted: boolean;
  celebrityRecognitionConfidence: number | null;
  celebrityRecognitionModelVersion: string | null;
  celebrityFallbackReason: CelebrityFallbackReason;
}

export type CelebrityFallbackReason =
  | 'allowlistUnavailable'
  | 'allowlistEmpty'
  | 'recognitionUnavailable'
  | 'invalidModelOutput'
  | 'notRecognized'
  | 'nonAllowlistedOutput'
  | 'lowConfidence'
  | null;

export type FilterMap = Record<string, string[]>;

export interface SearchRequest {
  imageUrl?: string;
  imageFile?: Blob;
  cropFile?: Blob;
  textQuery?: string;
  top: number;
  filters: FilterMap;
}
