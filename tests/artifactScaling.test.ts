import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARTIFACT_MAX_ACCOUNT_COUNT, artifactListOutput, type ArtifactSummary } from '../shared/artifacts';
import type { Actor } from '../server/auth';

const mocked = vi.hoisted(() => ({ rows: vi.fn(), user: vi.fn(), transaction: vi.fn(), uploads: vi.fn(), retainUploads: vi.fn() }));
vi.mock('../server/db', () => ({ rows: mocked.rows, transaction: mocked.transaction }));
vi.mock('../server/auth', () => ({ users: () => ({ findOne: mocked.user }) }));
vi.mock('../server/uploads', () => ({ uploads: mocked.uploads, retainUploads: mocked.retainUploads }));
import { artifactOperation } from '../server/artifacts';

type Metadata = Omit<ArtifactSummary, 'id'> & { _id: string; userId: string };
type OwnerIndex = { all: Metadata[]; listed: Metadata[] };
type Query = { userId: string; ephemeral?: boolean; $or?: [{ updatedAt: { $lt: string } }, { updatedAt: string; _id: { $lt: string } }] };
type QueryRead = { query: Query; projection: Record<string, unknown>; sort?: Record<string, number>; limit?: number; bucketRows: number; examined: number; returned: number; bytes: number };
const owners = new Map<string, OwnerIndex>();
const reads: QueryRead[] = [];
const fixture = { records: 0, owners: 10_000, total: 100_000 };
let bodiesMaterialized = 0, ownerLookups = 0;
const ownerId = (index: number) => `synthetic-owner-${index}`;
const artifactId = (index: number) => `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
const actor = (index: number): Actor => ({ userId: ownerId(index), source: 'external', scope: 'read' });
const compare = (left: Metadata, right: Metadata) => right.updatedAt.localeCompare(left.updatedAt) || right._id.localeCompare(left._id);

/** The fixture is assembled once. Requests use keyed owner/visibility buckets
 * and binary keyset seeks, never a scan of the 100,000-record fixture. This is
 * an algorithmic contract fake, not a Mongo query planner or capacity test. */
function indexedFind(query: Query, options: { projection?: Record<string, unknown> }) {
  if (!query.userId || !owners.has(query.userId)) throw Error('An indexed owner constraint is required.');
  if (!options.projection) throw Error('Artifact lists must project metadata before reading rows.');
  const projection = options.projection;
  for (const field of ['bodyHtml', 'data', 'refreshInstruction', 'assets']) if (Object.hasOwn(projection, field) && projection[field] !== 0) throw Error(`Source field ${field} was requested by the list.`);
  ownerLookups++;
  const index = owners.get(query.userId)!;
  // Visibility selects a prebuilt compound-index bucket before pagination.
  const bucket = query.ephemeral === false ? index.listed : index.all;
  const read: QueryRead = { query: structuredClone(query), projection: structuredClone(projection), bucketRows: bucket.length, examined: 0, returned: 0, bytes: 0 };
  reads.push(read);
  return {
    sort(value: Record<string, number>) { read.sort = value; return this; },
    limit(value: number) { read.limit = value; return this; },
    async toArray() {
      if (JSON.stringify(read.sort) !== JSON.stringify({ updatedAt: -1, _id: -1 })) throw Error('The indexed artifact order must include its ID tie break.');
      if (!read.limit || read.limit < 1 || read.limit > 51) throw Error('The underlying page must be bounded before materialization.');
      let start = 0;
      if (query.$or) {
        const [older, tie] = query.$or, time = older.updatedAt.$lt, id = tie._id.$lt;
        if (tie.updatedAt !== time) throw Error('The timestamp/ID cursor must be one indexed keyset boundary.');
        let end = bucket.length;
        while (start < end) {
          const middle = Math.floor((start + end) / 2), row = bucket[middle]; read.examined++;
          if (row.updatedAt < time || row.updatedAt === time && row._id < id) end = middle; else start = middle + 1;
        }
      }
      const page = bucket.slice(start, start + read.limit); read.examined += page.length; read.returned = page.length;
      const projected = page.map(row => {
        const result: Record<string, unknown> = {};
        for (const [field, expression] of Object.entries(projection)) {
          if (expression === 1) result[field] = row[field as keyof Metadata];
          else if (field === 'hasRefreshInstruction') result[field] = row.hasRefreshInstruction;
          else if (expression !== 0) throw Error(`Unexpected list projection ${field}.`);
        }
        // Any later attempt to hydrate a summary from source fails immediately.
        for (const field of ['bodyHtml', 'data', 'refreshInstruction', 'assets']) Object.defineProperty(result, field, { enumerable: false, get() { bodiesMaterialized++; throw Error('An artifact source body was materialized by a list.'); } });
        return result;
      });
      read.bytes = Buffer.byteLength(JSON.stringify(projected));
      return projected;
    },
  };
}

beforeAll(() => {
  const ordinary = Math.floor((fixture.total - ARTIFACT_MAX_ACCOUNT_COUNT) / (fixture.owners - 1));
  const extra = (fixture.total - ARTIFACT_MAX_ACCOUNT_COUNT) % (fixture.owners - 1);
  for (let owner = 0; owner < fixture.owners; owner++) {
    const count = owner === 0 ? ARTIFACT_MAX_ACCOUNT_COUNT : ordinary + (owner <= extra ? 1 : 0), all: Metadata[] = [];
    for (let index = 0; index < count; index++) {
      fixture.records++;
      // Timestamp ties deliberately exercise the stable ID cursor.
      const time = new Date(Date.UTC(2026, 9, 22) + Math.floor(index / 3) * 1000).toISOString();
      all.push({ _id: artifactId(fixture.records), userId: ownerId(owner), title: `Artifact ${fixture.records}`, ephemeral: index % 3 === 0,
        revision: 1, contentRevision: 1, hasRefreshInstruction: index % 2 === 0, createdAt: time, updatedAt: time, contentUpdatedAt: time, dataUpdatedAt: time, producer: { kind: 'hosted', name: 'Your agent' } });
    }
    all.sort(compare); owners.set(ownerId(owner), { all, listed: all.filter(row => !row.ephemeral) });
  }
});

beforeEach(() => {
  reads.length = 0; bodiesMaterialized = 0; ownerLookups = 0;
  mocked.rows.mockReset().mockImplementation((name: string) => { if (name !== 'artifacts') throw Error(`Unexpected collection ${name}.`); return { find: indexedFind }; });
  mocked.user.mockReset().mockImplementation(async ({ _id }: { _id: string }) => owners.has(_id) ? { _id, handle: 'synthetic-owner' } : null);
  mocked.transaction.mockReset().mockImplementation(() => { throw Error('A list must not open a write transaction.'); });
  mocked.uploads.mockClear(); mocked.retainUploads.mockClear();
});

describe('synthetic indexed artifact-list contract, not Mongo or network capacity', () => {
  it('pages 100,000 metadata records across 10,000 owners without visiting unrelated owners or reading bodies', async () => {
    expect(fixture.records).toBe(100_000); expect(owners.size).toBe(10_000); expect(owners.get(ownerId(0))!.all).toHaveLength(200);
    const heavy = actor(0), expected = owners.get(heavy.userId)!.listed;
    const first = artifactListOutput.parse(await artifactOperation('artifacts.list', { limit: 20 }, heavy));
    const next = artifactListOutput.parse(await artifactOperation('artifacts.list', { limit: 20, cursor: first.nextCursor! }, heavy));
    expect(first.items.map(row => row.id)).toEqual(expected.slice(0, 20).map(row => row._id));
    expect(next.items.map(row => row.id)).toEqual(expected.slice(20, 40).map(row => row._id));
    expect(new Set([...first.items, ...next.items].map(row => row.id)).size).toBe(40);
    expect([...first.items, ...next.items].every(row => !row.ephemeral)).toBe(true);
    expect(ownerLookups).toBe(2); expect(mocked.user).toHaveBeenCalledTimes(2);
    for (const [index, read] of reads.entries()) {
      expect(read.query.userId).toBe(heavy.userId); expect(read.query.ephemeral).toBe(false);
      expect(read.sort).toEqual({ updatedAt: -1, _id: -1 }); expect(read.limit).toBe(21);
      expect(read.bucketRows).toBeLessThanOrEqual(ARTIFACT_MAX_ACCOUNT_COUNT);
      expect(read.examined).toBeLessThanOrEqual(21 + Math.ceil(Math.log2(ARTIFACT_MAX_ACCOUNT_COUNT)));
      expect(read.returned).toBe(21); expect(read.bytes).toBeLessThan(32 * 1024);
      expect(Buffer.byteLength(JSON.stringify(index === 0 ? first : next))).toBeLessThan(32 * 1024);
      expect(Object.keys(read.projection)).not.toEqual(expect.arrayContaining(['bodyHtml', 'data']));
    }
    expect(bodiesMaterialized).toBe(0); expect(mocked.transaction).not.toHaveBeenCalled(); expect(mocked.uploads).not.toHaveBeenCalled(); expect(mocked.retainUploads).not.toHaveBeenCalled();
  });

  it('keeps the maximum page and explicit omitted-record management on the same bounded owner index', async () => {
    const heavy = actor(0), first = artifactListOutput.parse(await artifactOperation('artifacts.list', { limit: 50, includeEphemeral: true }, heavy));
    const next = artifactListOutput.parse(await artifactOperation('artifacts.list', { limit: 50, includeEphemeral: true, cursor: first.nextCursor! }, heavy));
    expect(first.items.map(row => row.id)).toEqual(owners.get(heavy.userId)!.all.slice(0, 50).map(row => row._id));
    expect(next.items.map(row => row.id)).toEqual(owners.get(heavy.userId)!.all.slice(50, 100).map(row => row._id));
    expect(first.items.some(row => row.ephemeral)).toBe(true);
    for (const read of reads) { expect(read.limit).toBe(51); expect(read.examined).toBeLessThanOrEqual(51 + Math.ceil(Math.log2(ARTIFACT_MAX_ACCOUNT_COUNT))); expect(read.bytes).toBeLessThan(64 * 1024); }
    expect(bodiesMaterialized).toBe(0);
  });

  it('uses one small owner bucket even when that owner is last in the global fixture', async () => {
    const last = actor(fixture.owners - 1), expected = owners.get(last.userId)!;
    const result = artifactListOutput.parse(await artifactOperation('artifacts.list', {}, last));
    expect(result.items.map(row => row.id)).toEqual(expected.listed.map(row => row._id)); expect(result.nextCursor).toBeNull();
    expect(reads).toHaveLength(1); expect(ownerLookups).toBe(1); expect(reads[0].examined).toBe(expected.listed.length);
    expect(reads[0].bucketRows).toBeLessThanOrEqual(10); expect(reads[0].bytes).toBeLessThan(8 * 1024); expect(bodiesMaterialized).toBe(0);
  });
});
