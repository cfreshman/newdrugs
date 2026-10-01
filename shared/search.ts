export const searchDatasets = ['profiles', 'posts', 'replies', 'threads', 'spaces'] as const;
export type SearchDataset = typeof searchDatasets[number];
export type SearchMode = 'hybrid' | 'semantic' | 'keyword';
export interface SearchConstraints {
  scope?: 'public'|'friends'|'saved'; near?: string; radiusMiles?: number; authorId?: string; after?: string; beforeDate?: string;
}
export interface SearchEvidence { field: string; text: string; entityId: string; entityType: 'person' | 'post' | 'space' }
export interface SearchMatch {
  id: string; dataset: SearchDataset; entityType: 'person' | 'post' | 'space'; entityId: string; ownerId: string;
  score: number; evidence: SearchEvidence[];
  signals: { semantic?: number; lexical?: number; freshness?: number; distance?: number; diversity?: number; exact?: boolean };
  sourceHash: string; sourceRevision: string;
  record: unknown;
}
export interface SearchRetrieval {
  id: string; mode: SearchMode | 'exact'; model: string; dimensions: number; indexVersion: string;
  constraints: SearchConstraints; candidates: number; incomplete: boolean; notices: string[];
  indexedAt?: string; approximate: boolean;
}
export interface SearchResult { matches: SearchMatch[]; retrieval: SearchRetrieval; nextCursor: string | null }
