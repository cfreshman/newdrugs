import hnswlib from 'hnswlib-node';
const { HierarchicalNSW } = hnswlib;
import { rows } from '../db';
import { DIMENSIONS, INDEX_VERSION, MAX_DOCUMENTS, type SearchDocument } from './model';
import { dot } from './ranking';

type Metadata = Omit<SearchDocument, 'vector'>;
export class PublicIndex {
  readonly graph = new HierarchicalNSW('cosine', DIMENSIONS);
  readonly metadata = new Map<string, Metadata>();
  private labels = new Map<string, number>(); private ids: string[] = [];
  incomplete = false;
  private readers = 0; private retired = false;
  retain() { if(this.retired)throw new Error('Search index was retired.');this.readers++;let released=false;return () => { if(released)return;released=true;this.readers--;if(this.retired && !this.readers)this.dispose(); }; }
  retire() { this.retired=true; if(!this.readers)this.dispose(); }
  private dispose() { this.graph.initIndex(16); this.metadata.clear(); this.labels.clear(); this.ids=[]; }
  constructor() { this.graph.initIndex({ maxElements: 16, m: 16, efConstruction: 160 }); this.graph.setEf(160); }
  add(document: SearchDocument) {
    if (!document.vector || document.vector.length !== DIMENSIONS || this.metadata.size >= MAX_DOCUMENTS) { this.incomplete = true; return; }
    const { vector, ...metadata } = document; const label = this.ids.length;
    if(label>=this.graph.getMaxElements())this.graph.resizeIndex(Math.min(MAX_DOCUMENTS,this.graph.getMaxElements()*2));
    this.graph.addPoint(vector, label); this.labels.set(document._id, label); this.ids.push(document._id); this.metadata.set(document._id, metadata);
  }
  vector(id: string) { const label = this.labels.get(id); return label === undefined ? undefined : this.graph.getPoint(label); }
  search(vector: number[], eligible: Set<string>, limit = 150) {
    if (eligible.size <= 500) return [...eligible].map(id => ({ id, score: dot(vector, this.vector(id)!) })).sort((a,b) => b.score-a.score || a.id.localeCompare(b.id)).slice(0,limit);
    const result = this.graph.searchKnn(vector, Math.min(limit, eligible.size), label => eligible.has(this.ids[label]));
    return result.neighbors.map((label, i) => ({ id: this.ids[label], score: 1 - result.distances[i] }));
  }
}
let cached: { revision: string; index: PublicIndex } | undefined, building: Promise<PublicIndex> | undefined;
export async function getIndex() {
  const lease = (index: PublicIndex) => ({index,release:index.retain()});
  const revision = String((await rows('searchMeta').findOne({ _id: 'generation' }))?.revision || 'empty');
  if (cached?.revision === revision) return lease(cached.index);
  if (building) return lease(await building);
  building = (async () => {
    const index = new PublicIndex();
    const documents = rows<SearchDocument>('searchDocuments').find({ indexVersion: INDEX_VERSION }).sort({ indexedAt: -1, _id: 1 }).limit(MAX_DOCUMENTS + 1).batchSize(64);
    for await (const document of documents) index.add(document);
    const previous=cached?.index; cached = { revision, index }; previous?.retire(); return index;
  })();
  try { return lease(await building); } finally { building = undefined; }
}
export function resetIndex() { cached?.index.retire(); cached = undefined; }
