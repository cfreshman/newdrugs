# Finding people and worthwhile things to do

Research and plan, September 25, 2026. The public profile/post/reply core is now implemented; see [implementation and measured limits](semantic-search-implementation.md). Later datasets and dedicated-engine experiments below remain proposals. This is separate from operation-catalog semantic discovery. OpenAI's built-in live web search is already enabled. No replacement web-search vendor is required for activity suggestions.

## Recommendation

Build one permission-aware retrieval layer over persisted, versioned search datasets. Start with public, discoverable profiles and public posts. Combine semantic retrieval with exact/lexical matching, coarse geographic filtering, freshness, and diversity. Return current authorized records, evidence, and exact app links—not just a list of vector scores.

Use the existing OpenAI embedding model as the baseline so the first evaluation does not depend on another provider account. Benchmark alternatives against New Drugs tasks before switching. Keep MongoDB as the source of truth. My recommended dedicated search-engine candidate is Qdrant, with self-managed MongoDB Search as a serious alternative now that it is generally available. A decision requires a cloud capacity check: the current 1 GB host already runs both application stages and MongoDB and is not a sound place to quietly add an unbounded search workload.

Do the evaluation and initial index in cloud dev. Production data, databases, release numbers, and infrastructure remain separate until a production rollout is explicitly authorized. Use the implementation document and live catalog for current contracts. Endpoint examples below describe the original plan and may differ from the final operation names.

## The behavior we want

- “Anyone nearby who would be into a low-key photo walk?” Find people whose own profile or public posts support that interest, even if they wrote “street photography” rather than “photo walk.” Explain the evidence and link each profile.
- “Something outdoors this weekend, not a big group.” Combine nearby people/posts with current web results. Respect the weekend's actual dates and the user's timezone. Offer two or three practical options with sources.
- “More like this post, but closer and more recent.” Retrieve similar posts, apply explicit area/date constraints, and avoid returning five nearly identical posts from one author.
- “Who else was talking about fixing bikes?” Search saved posts, then resolve their authors. Do not turn an incidental mention into a permanent inferred interest on their profile.
- “I liked these, but not the loud bar idea.” Use explicit positive/negative feedback to refine this search. Keep that preference private and editable.
- “Can I chat with Cyrus?” Resolve the person and connection status, then open the conversation or prepare a reviewed invitation. Retrieval should lead to a usable next action.
- “We could talk online first.” Offer pair.video as a concrete option. Its public app currently creates a room through its own New call flow. Until there is a supported integration contract, use its homepage and a real user-created link; do not invent a room URL or claim a call has been created.

## What current research changes

The useful advances are combinations of retrieval methods, better representations, and better agent control—not a reason to add every technique at once.

| Method | What it contributes | New Drugs use |
| --- | --- | --- |
| Dense semantic vectors | Meaning and paraphrases | Primary candidate retrieval for profiles and posts |
| Lexical/BM25 or sparse retrieval | Names, phrases, uncommon nouns, exact topics | Run alongside dense search; exact handles/IDs always take a deterministic path |
| Rank fusion | Combines different retrievers without pretending their raw scores share a scale | Baseline hybrid ranking; tune on our judgments |
| Cross-encoder reranking | Reassesses a small candidate set against the actual request | Optional second stage for nuanced social/activity queries |
| Multi-vector late interaction | Preserves token-level matching rather than compressing everything into one vector | Benchmark for longer posts/threads and strict multi-constraint queries |
| Contextual/late chunking | Retains the surrounding context of a document chunk | Threads, saved activity guides and imported documents; usually unnecessary for a short profile |
| Matryoshka dimensions and quantization | Trades index size/latency against recall | Evaluate when the corpus grows, retaining a full-quality comparison baseline |
| Diversity/MMR | Reduces near-duplicate results | Distinct people, authors, interests and activity options |
| Relevance feedback | Improves a query using explicit relevant/irrelevant examples | “More like these,” with bounded, private feedback |
| Iterative agent retrieval | Lets the agent search, inspect, refine and stop based on evidence | Multi-step social requests rather than one huge search prompt |

Qdrant's Query API supports nested retrieval stages and dense/sparse fusion; its documentation also describes candidate retrieval followed by larger-vector or multi-vector rescoring. That makes it a practical engine to evaluate for this design. [Hybrid and multi-stage queries](https://qdrant.tech/documentation/search/hybrid-queries/)

Qdrant exposes MMR and relevance-feedback retrieval. MMR is directly relevant to avoiding repetitive social suggestions; feedback is an experiment to evaluate rather than an automatic license to learn hidden preferences. [Search relevance](https://qdrant.tech/documentation/search/search-relevance/)

Voyage's current contextual model is `voyage-context-4`; the older `voyage-context-3` is now listed as a previous generation. Its current reranker documentation lists `rerank-3` and `rerank-3-lite` as preview models and `rerank-2.5` variants as available alternatives. These are benchmark candidates, not a reason to add a new production dependency before evaluation. [Contextual embeddings](https://docs.voyageai.com/docs/contextualized-chunk-embeddings), [rerankers](https://docs.voyageai.com/docs/reranker)

Contextual retrieval predates these current models: Anthropic's 2024 work combines contextualized chunks, lexical retrieval and reranking. Late chunking embeds tokens with document context before pooling chunks. Both matter more for threads/documents than for a single short bio. Published benchmark gains are not promises about this app. [Anthropic's method](https://www.anthropic.com/engineering/contextual-retrieval), [late-chunking paper](https://arxiv.org/abs/2409.04701)

Recent agentic-retrieval work supports giving the model complementary search/open/find tools and measuring the whole retrieval loop. It also highlights redundant calls and routing costs. Use a bounded loop with clear evidence and stopping conditions; do not assume that more agent turns improve results. [AgenticRAG, May 2026](https://arxiv.org/abs/2605.05538), [HotelQuEST, February 2026](https://arxiv.org/abs/2602.23949)

## Search-engine choice

| Candidate | Fit | Decision |
| --- | --- | --- |
| Qdrant with MongoDB records | Dedicated dense/sparse retrieval, filtering, multi-stage ranking and diversity | Recommended candidate for a cloud-dev benchmark; keep its indexes rebuildable |
| Self-managed MongoDB Search/Vector Search | Fewer conceptual data systems; Lucene text search and vectors next to MongoDB | Strong alternative, but requires an infrastructure/version evaluation |
| OpenAI managed vector stores | Convenient managed document retrieval with filters and hybrid ranking | Useful for private uploaded documents; not my first choice for fast-changing social records and relationship permissions |
| Application-side exact vector scans | Simple and an excellent correctness baseline on a small bounded dataset | Use in evaluation, not as an unbounded production scan |
| Add PostgreSQL/pgvector | Capable, but adds another database and operational model | Not justified while MongoDB is already the application database |

MongoDB's self-managed search became generally available in June 2026. Community Edition can run a standalone `mongot` process. The current requirements specify MongoDB 8.3 or newer; our host is on 8.0.32. Its sizing guide gives substantially larger starting configurations than our current shared 1 GB host. Those are sizing recommendations, not a claim that every tiny index technically requires that much RAM. [Release notes](https://www.mongodb.com/docs/search/self-managed/current/release-notes/), [deployment options](https://www.mongodb.com/docs/search/self-managed/current/), [compatibility](https://www.mongodb.com/docs/search/self-managed/current/deployment/compatibility-requirements/), [sizing](https://www.mongodb.com/docs/search/self-managed/current/resource-planning-sizing/quick-start/)

OpenAI managed retrieval supports metadata filtering and weighted semantic/text fusion. Its document-store abstraction is valuable, but New Drugs still needs canonical live permission checks and record-level invalidation. [OpenAI retrieval](https://developers.openai.com/api/docs/guides/retrieval)

Before provisioning: measure current CPU/RAM/disk headroom, estimate index volume, compare a dedicated search service with a host resize, and present the actual configuration and current monthly cost. Do not upgrade the shared MongoDB process or restart production merely to test search.

## Saved datasets

Use separate logical datasets and embedding representations, even if an engine stores some in the same collection. Never mix embedding models or incompatible dimensions in one similarity space.

| Dataset | Source text | Filters and lifecycle |
| --- | --- | --- |
| `public_profiles` | Human-written bio and explicit interests; optional separate vectors per facet | Discoverability, account status, coarse area, blocks, source revision |
| `public_posts` | Original post text, with human-provided topic/context when available | Author visibility rules, publication/deletion, coarse area, timestamp |
| `public_threads` (later) | Post plus nearby replies, retaining each author and source ID | Rebuild affected windows on edit/delete; never invent a combined author |
| `activities` (later) | Verified venue/event descriptions and relevant public posts | Source URL, event time, timezone, area, price/accessibility facts, expiry and verification time |
| `saved_queries` | A user's explicit search intent and constraints | Owner-only, versioned, editable; notifications opt-in |
| `private_memory` (later) | User-approved preferences and selected private notes | Owner-only, separately keyed, deletable; never enters public discovery |
| `private_files` (later) | Text extracted from that owner's verified uploads | Owner/file authorization, retention, chunk provenance and deletion |
| `operation_catalog` | Current authorized operation descriptions/contracts | Existing capability search; keep separate from social data |

Do not turn an embedding into an AI-written profile. Do not concatenate all of a person's posts into an opaque permanent personality dossier. Match their public posts as posts and cite those posts as evidence. Do not infer sensitive traits from photos or private conversations.

Photos are not in the first semantic index. A later opt-in multimodal experiment could find public activity imagery such as trails or artwork, with clear provenance. It must not become facial recognition, identity matching, or sensitive-trait inference.

## Index documents and provenance

Each search document needs:

```text
dataset, entityType, entityId, ownerId
sourceRevision, sourceHash, sourceUpdatedAt
text, sourceField, chunkId, contextEntityIds
embeddingModel, embeddingVersion, dimensions, preprocessingVersion
visibility, coarseCell, coarsePoint, createdAt, expiresAt
indexGeneration, indexedAt, tombstonedAt
```

The source hash binds an embedding to the actual human text and preprocessing version. Include model, dimensions and task type in embedding-cache keys. A location or visibility change should update filter metadata without re-embedding unchanged text. Keep original text and its authoritative source ID available for explaining a match.

For short profiles/posts, begin with one whole-text vector plus an explicit-interest facet for profiles. Do not add elaborate chunking to a two-sentence bio. Longer threads/documents get context-preserving chunks and stable offsets. Chunk context must not silently add claims that are not present in the source.

## Ingestion and freshness

1. Commit the human record and a search outbox entry in the same MongoDB transaction.
2. A durable worker leases entries and reads the latest canonical revision. Coalesce repeated edits and skip obsolete work.
3. Produce deterministic embedding input. Batch independent embedding requests within provider limits; this is internal indexing work, not a bulk mutation API exposed to agents.
4. Write vectors and payloads with the source revision. Only mark the outbox entry complete if it still describes the current source.
5. Index visibility changes and tombstones promptly. Canonical reads must reject removed/private/blocked records even during index lag.
6. Maintain an indexing watermark, retry/dead-letter state, and per-dataset health. A failed embedding is visible to operators and does not block saving a profile.
7. Rebuild into a new index generation, compare it in shadow mode, then swap the active generation. Keep a rollback generation until validation passes.

Deletion removes vectors, sparse terms, cached snippets and derived facets. If the index is stale, say retrieval is incomplete; never claim the dataset has no matches simply because indexing is behind.

## Query pipeline

1. Resolve the actor and requested dataset. Compile permitted filters on the server. The agent never supplies its own authority or arbitrary database filters.
2. Handle exact IDs/handles and structured facts deterministically. Use semantic retrieval for meaning, not to guess record identity, distance, dates or totals.
3. Resolve coarse location and a clear radius. Calculate distance from stored grid points. Never interpolate back to a precise location.
4. Retrieve dense and lexical candidates in parallel with the same eligible scope. Keep a small exact-match lane for names and unusual terms.
5. Fuse candidate rankings. Deduplicate by canonical record ID; for people, limit repeated contributions from one person's posts.
6. Re-read canonical records and permissions before returning any text or explaining a match. Drop deleted/private/blocked records, then backfill from additional candidates within a documented bound.
7. Optionally rerank a bounded candidate set against the original request. Compare quality, latency and cost with the simpler baseline.
8. Apply an explicit freshness/distance preference and diversity pass. These are transparent ranking choices, not fabricated social compatibility percentages.
9. Return a small useful set with source evidence, provenance, approximate distance, and trusted exact links. Distinguish a direct record link from a search-surface link.

Never apply authorization only after leaking snippets from an index. Engine filtering reduces the candidate set, and canonical revalidation protects the final result. If post-filtering exhausts candidates, retrieve more or report a bounded/incomplete search; do not silently equate it with an empty eligible corpus.

## Agent-facing operations

Prefer a small set of composable typed reads over exposing raw vector-database commands:

- `search.datasets`: enumerate datasets available to this actor and their supported filters/freshness.
- `people.search`: add a semantic query while preserving structured area/radius filters and current privacy rules.
- `posts.search`: semantic/lexical/hybrid text, area, author, time window and bounded pagination.
- `search.similar`: find related visible records using a real record ID; resolve its current permissions first.
- `search.refine`: refine an existing query using explicit positive/negative examples and the original constraints.
- `search.explain`: return the source excerpts and ranking factors behind a result, without exposing another user's private data.
- `people.get`, `posts.get`, `connections.status`, `messages.list`: fetch authoritative details after discovery. Search output is not a substitute for an exact read before a consequential action.
- `activities.search` and saved searches can follow after the core public datasets work. External activity facts still use the already-enabled OpenAI web tool in hosted chat.

Each response should include `retrieval.mode`, dataset/index version, applied constraints, a bounded candidate count, warnings, freshness, and pagination state. ANN results are approximate. Scores are retrieval signals, not probabilities that two people will get along. Query cursors bind actor, filters, query hash, index generation and ranking mode; reusing a cursor with a changed request fails clearly.

Keep the same contract in HTTP, CLI and MCP. External agents can call all authorized direct operations without a New Drugs hosted-model charge. Required write confirmation remains in the canonical action contract: invitations and other serious actions pause; requested DMs in accepted connections send directly.

## How the agent should use search

The normal loop is: understand the request, retrieve, inspect, explain with links, offer a useful next step. Use a small query plan when the request combines concepts. For example, photo-walk companions may need a profile-interest search plus a recent-post search, merged by person without losing the source evidence.

Default budget: one primary retrieval and at most two clearly motivated refinements before explaining the result or asking for an actually missing preference. Exact lookups should not trigger a reranker or another model call. Stop once there is enough evidence. Record why a refinement occurred so evaluations can distinguish useful iteration from aimless tool use.

Do not widen distance, dates, price or other explicit constraints silently. If a wider search would help, label it. Treat negative preferences carefully: a vector near “not into nightlife” is not reliable evidence that someone wants nightlife. Reranking or explicit source checks must handle negation and competing requirements.

An invitation is a separate action after retrieval. The agent can prepare a specific note and target for review. It must not automatically invite everyone in search results or treat a saved search as standing authorization to message people.

## Activities and pair.video

For a pair or small group, use explicitly shared interests and approximate areas to suggest practical next steps. Avoid turning “common location” into a claimed exact midpoint or exposing either person's actual coordinates. Prefer public venues and verify current details when they matter.

The hosted agent already has live OpenAI web search. Search public terms such as activity, town and date; keep private names, profile text and messages out of the query. Return the actual event/venue link, verified date/time, and useful constraints such as price when sourced. If details are uncertain, say which ones need checking.

Offer online conversation when appropriate. The verified pair.video homepage is a valid starting destination. Its public frontend's current New call flow posts to `/api/rooms` and navigates using the returned room ID; that observation is not a stable third-party API promise. A future integration should use a documented room-creation contract, return the actual created URL, and share it only when the user requests that DM. Do not manufacture `/call/...` paths.

## Evaluation before choosing a model

Build a versioned, consented/synthetic evaluation corpus with realistic human writing. Include sparse bios, slang, misspellings, multilingual text, local place names, long threads, negation, changed interests, deleted posts, blocked accounts and deliberately empty results.

Judge at least 100 representative queries before enabling a new ranking path. Separate:

- retrieval quality: recall@K, nDCG, exact-name success, diversity and duplicate-author rate;
- policy correctness: zero unauthorized snippets or records, block/delete freshness, stage isolation;
- agent usefulness: correct tools, supported claims, useful inline links, practical next steps, no invented people or activities;
- performance/cost: end-to-end p50/p95, query embedding latency, reranker latency, tool-call count, tokens, cache hit rate and index lag.

Compare: lexical only; current OpenAI embedding baseline; hybrid; hybrid plus reranker; a stronger/current embedding candidate; and late interaction only where it has a plausible benefit. Keep the test labels separate from tuning. Do not select a model from a vendor leaderboard alone.

Run an exact-vector baseline over a bounded test dataset to measure ANN recall. Simulate edits/deletes during indexing, permission changes between retrieval and fetch, retries, model migration and interrupted index builds. Release only if relevance improves without weakening permission guarantees or breaking the latency budget.

## Costs and capacity

At 512 float32 dimensions, raw vectors use about 2 KB each: roughly 20 MB for 10,000, 205 MB for 100,000, and 2.05 GB for one million, before index overhead, sparse terms, metadata, replicas or extra facets. These are storage arithmetic estimates, not total RAM requirements.

Separate shared index maintenance from per-user hosted reasoning. Existing direct CLI/MCP operation discovery is platform-funded and free to the caller; social-search accounting should preserve that promise. Record embedding/reranking usage in platform cost telemetry with dataset, model and purpose. Add an operator budget cap and alerts before background jobs can run without a bound.

Cache safe query embeddings by model/version/text and scope where needed. Never cache authorized result payloads solely by query text. Avoid re-embedding unchanged source text. Re-evaluate quantization and dimensions with measured recall as the dataset grows.

## Delivery order and acceptance gates

1. **Contracts and evaluation corpus.** Define datasets, privacy rules, provenance, links and realistic judgments. Add semantic query fields without changing existing geographic semantics.
2. **Durable indexing.** Outbox, hashes, revisions, tombstones, backfill/retry tooling, and dataset health. Prove update/delete correctness in cloud dev.
3. **Baseline retrieval.** Existing embedding provider plus lexical search, geo filters, canonical revalidation and useful evidence. Compare exact and approximate retrieval.
4. **Agent/tool integration.** Typed search/get/refine flows, bounded query budgets, link delivery, and activity suggestions using the current web tool. Evaluate whole conversations.
5. **Progressive UI.** A browsable result list, exact profile/post views, visible constraints and a clear return to chat. Saved searches/notifications are opt-in.
6. **Ranking improvements.** Add reranking, diversity and explicit feedback where the evaluation proves their benefit. Keep a cheap baseline and rollback switch.
7. **Larger corpora and private datasets.** Contextual chunks, document search and any approved multimodal work after privacy, deletion and capacity tests pass.

At every stage, report what exists versus what is planned. Shipping the operation-catalog embedding index does not mean profiles and posts have semantic search. Creating embeddings does not mean the agent has usable search tools. The acceptance criterion is a person getting accurate, interesting, permitted results they can actually open and act on.
