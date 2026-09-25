import type { SearchDataset, SearchEvidence } from '../../shared/search';
import type { CoarseArea } from '../../shared/geo';
export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const DIMENSIONS = 512;
export const INDEX_VERSION = `public-v1:${EMBEDDING_MODEL}:${DIMENSIONS}`;
// Two stages share a 1 GB host. Do not grow a native index without a capacity review.
export const MAX_DOCUMENTS = 10000;
export interface SearchDocument {
  _id: string; dataset: Exclude<SearchDataset, 'threads'>; entityId: string; ownerId: string;
  text: string; evidence: SearchEvidence[]; terms: Record<string, number>; area: CoarseArea | null;
  createdAt: string; sourceHash: string; sourceRevision: string; vector?: number[];
  indexVersion: string; indexedAt: string; rootId?: string;
}
export interface SearchJob {
  _id: string; kind: 'profiles' | 'posts'; entityId: string; revision: string;
  status: 'queued' | 'working' | 'failed'; attempts: number; availableAt: number;
  lease?: string; leaseUntil?: number; error?: string;
}
