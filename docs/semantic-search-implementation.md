# Public semantic search

Implemented September 25, 2026. `docs/semantic-search-plan.md` retains the research and later-stage ideas; this document describes the code that exists.

## What is searchable

Public discoverable profiles, public posts, and public replies. Profile text is still written by the person. Post matches cite the particular post and author, rather than inventing a permanent profile interest. `threads` searches the individual public posts and replies with their own provenance; it does not build an opaque combined-author embedding.

DMs, agent chats, uploaded files, photos and inferred sensitive traits are not indexed. Saved searches, private memory, event datasets, and multimodal retrieval remain later work.

People has Nearby and All people, in that order. Posts has All posts, Nearby and My posts. Search fields accept natural-language interests/topics. Nearby applies a strict radius around the selected coarse area center. The same-area result means “in your approximate area,” never actual zero-mile proximity. A post's area describes its tag, not its author's current location. The radius control uses the app's pill styling.

## Shared operations

- `people.search`: optional semantic query, `scope:nearby|all`, coarse area/radius, exact interest filter, paging.
- `posts.search`: query over posts/replies, optional coarse area/radius, author and date constraints.
- `search.query`: explicit public datasets with hybrid, semantic or keyword mode.
- `search.similar`: more like one currently authorized source, preserving explicit constraints.
- `search.refine`: positive and negative result IDs from an owned recent retrieval. Feedback expires with the retrieval; it never updates a profile or permanent inferred preference.
- `search.explain`: current source evidence, source hashes and ranking signals.
- `search.datasets`: dataset counts, pending/failed indexing, model, version and capacity.

CLI, MCP and hosted agent use these exact contracts. Returned people/post links are exact authorized record links. Scores are search ranking signals, not compatibility probabilities.

```sh
newdrugs read people.search '{"query":"photo walks","scope":"nearby","radiusMiles":25}'
newdrugs read people.search '{"query":"cooperative board games","scope":"all"}'
newdrugs read posts.search '{"query":"fixing bicycles","near":"852a3313fffffff","radiusMiles":25}'
newdrugs read search.datasets
```

Use `--profile dev` for the maintainer's separate cloud-dev connection. Normal users use the default public connection.

## Persistence and authorization

Source writes enqueue indexing work in the same MongoDB transaction as the profile/post mutation and action receipt. Jobs coalesce edits, lease work, retry with bounded backoff, and retain failure state and retry failed jobs hourly. A source revision and lease must still match when the vector is installed. Unchanged text reuses its vector after area/visibility metadata changes. Startup backfill processes bounded pages and persists its cursor.

MongoDB stores versioned vectors, lexical terms and provenance. OpenAI `text-embedding-3-small` uses 512 dimensions. The native HNSW index is rebuildable derived state, adapted from Pangaea's index approach. A small filtered corpus uses exact cosine; larger eligible sets use filtered ANN. BM25 supplies lexical candidates. Rank fusion and bounded semantic/lexical scoring retain meaning-score separation, then freshness and MMR reduce repetitive authors/results. No second paid reranking model is called.

Every page, explanation and feedback request reloads the canonical source and current block/discovery state before returning text. Old vectors cannot expose deleted/private/blocked or edited records. Owner-bound retrieval snapshots expire in ten minutes, keep IDs/hashes/signals rather than cached snippets, and are limited to twenty per account. Cursors bind the search input. Query vectors expire after one day. Result payloads are never shared between users.

## Capacity and cost

The existing 1 GB droplet runs both app stages and MongoDB. There is no extra search service, MongoDB upgrade or new paid infrastructure. Each stage caps its native index at 10,000 documents and reports incomplete indexing instead of silently growing memory. The raw native vectors occupy about 20 MB per full index, in addition to graph, metadata and transient rebuild overhead. Small indexes allocate proportionally. Retired native graphs release their allocation after their last active reader; rebuilds do not depend on JavaScript garbage collection. Native compilation requires Python, make and g++.

Query frequency is capped at thirty new retrievals per account per minute. A per-stage daily embedding budget defaults to $0.25 (`SEARCH_DAILY_BUDGET_NANOS=250000000`). A conservative byte-based token reservation precedes provider calls; ambiguous failures retain that reservation. Actual usage is recorded in `platformUsage`. Search costs are platform-funded, and do not draw from users' chat balances. Existing operation-catalog embeddings have their own accounting.

Embedding failures return clearly labeled keyword fallback. Pending or failed indexing is reported as incomplete. Large-scale recall/capacity needs a new host/search-engine decision before raising the cap. The Qdrant/MongoDB Search comparison in the research document is still useful for that stage.

## Validation and limits

`tests/semanticSearch.test.ts` checks strict geographic, owner, author/date, block and discovery filters; stale workers; metadata-only edits; deleted content; owner-bound cursors and feedback; exact result links; and filtered ANN recall against exact cosine. Tests use only the isolated cloud `newdrugs_test` database.

`tests/fixtures/search-judgments.json` contains 100 manually written synthetic queries across twenty interests and forty profile/post texts. `npx tsx scripts/evaluate-search.mts` uses real 512-dimensional OpenAI embeddings and writes its report under ignored `.data/research`. The September 25 run reached 96% topic top-1, 100% topic recall@5, and MRR 0.9783 after correcting lexical over-weighting. The earlier equal rank-fusion baseline reached 88% top-1. This is a small synthetic relevance test, not proof of quality on an unseen production corpus. It does not establish precise negation understanding, sensitive-trait inference, or a real-person compatibility metric.

Follow-up work includes a held-out real-world judgment set, larger-corpus tail-latency/memory measurements, optional evidence-based reranking if measured gains justify it, and explicit saved-query/event features. Private datasets require separate consent and authorization designs.
