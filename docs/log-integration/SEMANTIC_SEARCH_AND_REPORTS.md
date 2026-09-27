# Log semantic search and personal reports

Research and implementation proposal, September 27, 2026.

**Status: plan only.** No indexing, report generation, new billing, provider calls over user content, or application deployment is authorized or performed by this document. The report's audience and billing toggle were ideas to evaluate, not fixed requirements.

## Latest product direction: user instructions and agent notes

The founder subsequently suggested using Wayfinder-style custom instructions plus a separate field the agent maintains. Source inspection confirms Wayfinder has one private 8,000-character preference field with optimistic revision checks, per-run snapshots and prompt framing below current explicit requests (`convex/agentRuntime/{preferences,customInstructions,runtimeState}.ts`). Its `agentMemory/` module is separate; there is not already a second freely edited custom-instructions field to copy verbatim.

Recommended New Drugs adaptation: **Your instructions** are user-owned and changed by the agent only at explicit user request. **Agent notes** are a bounded private working memo the agent may update directly, without an approval for each edit. The user can inspect, correct or clear it. Treat the memo as fallible remembered context, never as system policy or authority to expand permissions/spending. Current requests and user instructions take precedence. Keep provenance and dates for evidence-dependent claims, and do not turn retrieved content into standing commands.

This is the simpler first expression of the report idea: no separately scheduled paid report is necessary to maintain notes during ordinary authorized chat work. Persistence itself is a free app operation; any extra model/context tokens still follow normal at-cost billing. Snapshot both fields per run and apply edits to subsequent runs without repeatedly rebuilding a global agent configuration. Use revision checks and idempotency, a strict size/token budget, and structured source references when facts depend on Log/chat access. Revocation must invalidate derived claims, not merely hide their links.

Store Agent notes as individual slots, each with a stable ID, key/title, content, core/non-core class, source references, timestamps and its own revision. Core slots are returned together for ordinary run context within a strict aggregate token budget; non-core slots remain explicitly readable and searchable. The normal context read returns the small bounded slot collection together; individual create/update/delete operations make focused edits without rewriting a shared blob. Enforce a total context budget as well as per-slot bounds and use optimistic conflicts/idempotency. If memory grows into a larger library, semantic search is an additional retrieval path, not a requirement for reading the core notes. Do not silently discard core slots to fit a prompt. Every context read and slot mutation returns pressure metadata: core tokens used/limit/remaining, utilization and a comfortable/near-limit/full status. A rejected over-budget write returns the same data so the agent can merge, shorten or demote individual slots. Never silently evict core memory. Bound and advertise non-core storage too. Token estimation/version must be explicit; pressure is prompt-context capacity, not permission or financial budget. User instructions remain a separate user-owned value.

Semantic search remains the scalable detailed-history layer. The two fields must not grow into an unbounded diary or substitute for canonical source reads. The broader overview/report pipeline below is optional later work; scaling work is the currently authorized implementation objective.

## Recommended direction

Build a private evidence index with two ways to use it:

1. **Search:** find a particular memory by meaning, people, place, or date.
2. **Explore:** see useful themes and connections without having to guess a query, then open the actual entries behind them.

The report should be a compact, revisitable overview assembled from that evidence. It should not become a daily essay, an invented personality profile, or a reason to run an agent repeatedly. Reuse the same embeddings and provenance for search, topic browsing, and optional written interpretations.

Start with the viewer's own authorized Log. Later, the same architecture can support private discovery recommendations from other people's public material. Do not expose a person's private report to other people, or derive public profile claims from their Log. The founder was unsure which audience matters most; this sequence supplies immediate value without making that decision irreversible.

**Build order:** scaling groundwork and indexed retrieval → private hybrid search → free evidence-based overview → optional, cached AI interpretation → opt-in automatic updates → evaluate broader people discovery. Keep search and the factual overview usable without buying AI credits.

## What exists and what the measurements say

I inspected New Drugs' public and private-chat search, Log reads/writes, live invalidations, automations, billing and source-list navigation. I also read Wayfinder's embedding workers, deletion helpers and scoped semantic reads, and Logcal's text filtering. Reference projects were not modified.

Read-only production measurements returned aggregates only, not note text:

| Measurement | September 27 snapshot | Consequence |
| --- | ---: | --- |
| Active Log entries | 507 | Exact scoring is a useful small-subset fast path and evaluation baseline, not an unrestricted production retrieval strategy. |
| Entries with nonempty title/place/note text | 506 | This is nonempty coverage, not proof that the text is informative. |
| Total title/place/note characters | 23,249 | The corpus is small; elaborate summarization infrastructure would be premature. |
| Largest entry's combined text | 306 characters | One embedding per entry is sufficient for the current corpus. |
| Membership references | 802 | Embed shared entries once, not separately for every attendee. |
| Host RAM / available RAM | 961 / 292 MiB | Keep the new memory allocation bounded. |
| Swap currently used | 289 MiB | Avoid adding a graph service or local embedding model to this host. This is a point-in-time observation, not a diagnosis of active memory pressure. |

These counts exclude deleted entries and count text characters, not model tokens. They omit serialized metadata and provider framing. No live relevance or inference-quality benchmark has been run.

The immediate limit is the richness of the evidence, not vector-storage cost. Terse entries can support useful retrieval and collections, but paying for a larger model cannot supply unrecorded context. The report must earn its place by finding supported connections, rather than generating generic advice from sparse titles.

Current foundations:

- `server/log.ts`: exact access rules, date/person filters, Boolean text queries, current-source projection. `log.list` is chronological, not semantic.
- `server/search/embeddings.ts`: configured `text-embedding-3-small`, 512 dimensions, query cache, in-flight deduplication, provider accounting and a platform daily budget.
- `server/search/queue.ts` and `worker.ts`: transactional outbox, leases, source hashes and resumable backfill.
- `server/search/chat.ts`: private indexing, owner-bound result snapshots and final source revalidation. Its per-search Mongo vector scan is a baseline, not something to copy unchanged at larger volumes.
- `server/search/ranking.ts`: exact dot products, BM25 and hybrid ranking helpers. Public-social weights and thresholds need Log-specific evaluation.
- `server/automations.ts`, `wallet.ts`: isolated background runs, consented data scopes, reservations, usage settlement and cancellation.
- `src/logSequence.ts`, `useLogNeighbors.ts`: Previous/Next within the source collection. Search results must preserve this behavior.

## Research and the decisions it supports

| Approach | Useful finding | Decision for New Drugs |
| --- | --- | --- |
| Hybrid retrieval | Embeddings support paraphrases; lexical retrieval retains exact names and unusual wording. | Reuse the existing dense/lexical machinery, with Log-specific judgments. |
| GraphRAG community reports | Broad questions need coverage across the corpus, not just the nearest few chunks to one vague query. Its global query process can be resource-intensive. | Borrow stored theme summaries and evidence coverage, not its whole graph pipeline. [Global search](https://microsoft.github.io/graphrag/query/global_search/) |
| Standard / FastGraphRAG | Microsoft describes substantial extraction work; the cheaper variant substitutes NLP and accepts noisier graphs. | Our people, dates and attendance relationships already exist as structured records. Do not pay to rediscover them or add a Python/NLP service. [Indexing methods](https://microsoft.github.io/graphrag/index/methods/) |
| LightRAG | Combines entity/relationship retrieval with vector retrieval and incremental updates. | Borrow the incremental-update principle. A framework replacement needs measured gains first. [Paper](https://arxiv.org/abs/2410.05779) |
| RAPTOR | Summaries at multiple levels can support questions spanning many passages. | Keep room for topic summaries at larger scale; do not recursively summarize today's tiny entries. [Paper](https://arxiv.org/abs/2401.18059) |
| LongMemEval | Its evaluation separates extraction, reasoning across sessions, time, updates and abstention. | Test those dimensions explicitly instead of judging the system only on nice-looking search examples. [Paper](https://arxiv.org/abs/2410.10813) |
| SodaMem, August 2026 | Makes source evidence and distinctions between occurrence time, mention time and validity explicit. Its reported cost/accuracy comparison has self-grading and excluded-cost limitations. | Borrow provenance and temporal distinctions, not benchmark promises or a new graph store. [Paper](https://arxiv.org/abs/2608.08055) |

These sources motivate design choices; their benchmarks are not New Drugs performance measurements. The relevant comparison here is against our own exact retrieval and a small, bounded whole-corpus report baseline.

## Required scaling correction

The founder explicitly requires growth beyond today's corpus. The [scaling audit](../SCALING_AUDIT.md) identifies existing search, live-update, history, worker and media bottlenecks. Those are implementation prerequisites, not deferred wishes.

Production retrieval must use persistent incremental indexes with indexed access/metadata filters and bounded candidates. An exact scan is permitted only for a known small subset, initially at most 500 vectors, or offline evaluation. A cache does not make an unrestricted scan scalable.

The recommended retrieval-engine candidate is Qdrant, using indexed payload filters and dense/lexical hybrid candidates, with private and public datasets separated and final authorization in New Drugs. Use dataset/stage collections and ownership/membership payloads, not a collection for each individual user. Its documentation covers [indexed filtering](https://qdrant.tech/documentation/search/filtering/), [multitenancy](https://qdrant.tech/documentation/manage-data/multitenancy/), and [hybrid queries](https://qdrant.tech/documentation/search/hybrid-queries/). This is an implementation recommendation, not a claim that installing it alone supplies our ACL, revocation or capacity guarantees.

Benchmark the deployed configuration in an isolated capacity environment and present its sizing/cost before provisioning. Do not squeeze an unbounded new service into the existing 1 GB host. Mongo remains authoritative; the search index is derived and incrementally repairable. Test versioned upserts/tombstones and out-of-order jobs explicitly, without pretending that writes across two data systems are one atomic transaction.

## 1. Index the entry once

Create separate private collections. Do not add Log documents to the public HNSW graph or public `search.datasets` counts.

| Collection | Contents |
| --- | --- |
| `logSearchDocuments` | Entry ID, index version, semantic content hash, source revision, normalized vector, lexical terms, indexed time and evidence offsets/field references. |
| `logSearchJobs` | One coalesced job per entry, revision, lease, retry state and priority. |
| `logSearchMeta` | Backfill cursor, index generation, aggregate operational counters. |
| `logSearchResults` | Short-lived, actor-bound ranked IDs/hashes and query/filter identity, not copied diary text. |

Keep MongoDB as the source of truth. Use the existing embedding model/dimensions first. The provider supports reduced dimensions and normalized embeddings; retain explicit normalization and validation in our adapter. [Embedding guide](https://developers.openai.com/api/docs/guides/embeddings)

### Text representation

For current entries, embed a single deterministic document containing the human title, place and complete contribution text. Preserve field and contributor boundaries in provenance. Avoid duplicated boilerplate such as “Untitled,” generated introductions, or empty labels.

Store dates, member IDs, recurrence, media presence and source identity as structured metadata. Person names/handles resolve through current authorized records; they should not require re-embedding when someone changes their username. Historical people remain their original imported identities/labels, without automatic account linking.

A short entry titled “tennis” is searchable, but is weak evidence for an elaborate conclusion. Distinguish nonempty text from useful semantic coverage in the audit.

For future long entries, add deterministic passage indexing only when the entry exceeds a tested token threshold, initially around 600–800 tokens. Split at paragraph/contributor boundaries, with limited overlap inside long notes and complete source offsets. Reuse unchanged passage hashes. Do not truncate later contributors or treat a source's first 500 characters as its whole content.

Version the embedding model, dimensions, normalization and text/chunk recipe. Metadata-only changes update authorization/facets and revisions without another embedding call. Title/place/note edits are semantic changes. Attachment changes are metadata-only until a separately approved media-understanding feature exists.

### Media boundary

V1 indexes authored text, not image content, voice audio, videos or fetched web pages. Media-only entries remain available by person/date and in the calendar, but cannot honestly match “the photo with the red canoe.” Do not invent captions or pretend the image cache supplies semantic understanding.

If users actually need visual/audio recall, add an explicit, separately budgeted enrichment phase. Cache each derived caption/transcript by immutable file hash and extractor version, cite the original media, and keep it distinct from human-authored notes. No face identification or inferred personal attributes.

## 2. Incremental work and correctness

Use the public outbox design and Wayfinder's unchanged-text/stale-write checks:

1. Commit a Log mutation and its coalesced indexing job in the same transaction.
2. Load the current source and compute its semantic hash. Reuse matching vectors.
3. Embed changed text outside the transaction. Internally batch small embedding requests when useful; this is not a new bulk user-operation API.
4. Commit derived rows only if the job lease, revision and current source still match. A slow old worker cannot overwrite a newer edit or resurrect a deleted entry.
5. Notify only affected viewers that search/report data changed, through the existing live channel.

Audit all write paths: create, update, contribute, join/add-person, leave/final deletion, file cleanup/moderation, and migrations. Do not rely only on the browser or change-stream delivery. A periodic reconciliation pass repairs missed derived work; it is not the primary mutation mechanism.

Backfill 50 entry IDs at a time, with one low-priority worker and resumable progress. Current edits and interactive query embeddings take priority over historical indexing. Coalesce rapid edits; bound retries and provider work. Completing a deploy must not blindly re-embed the corpus.

On content removal, remove or invalidate its index and report dependencies transactionally. On membership, block, or suspension changes, invalidate relevant authorization generations. Final reads still check canonical sources, so index lag never grants access. A pure membership change should not force new embeddings for unchanged remaining text.

## 3. Search path

Add `log.search`, preserving `log.list` as the exact chronological/Boolean operation.

Proposed input:

```ts
{
  query: string;                 // required, natural-language meaning
  mode?: 'hybrid' | 'semantic' | 'keyword';
  from?: string; through?: string; // inclusive Log date-only boundaries
  personId?: string;
  scope?: 'all' | 'private' | 'shared';
  limit?: number; cursor?: string;
}
```

The authenticated actor is the owner of the retrieval. A `personId` narrows that actor's eligible entries; it never switches whose diary is searched. V1 searches attended entries, following ordinary `log.list`. A code holder's ability to open one invite does not make it part of their searchable corpus before joining.

Execution:

1. Authenticate and enforce the background agent's existing `logAccess` grant.
2. Construct indexed actor membership, dataset/stage and date/person filters. Do not enumerate every eligible entry ID before searching. Preserve current whole-entry block/suspension rules through index filters plus bounded canonical revalidation.
3. Embed the query once, with an account/stage/model namespace and bounded cache. Repeated identical queries and paging should not buy another embedding.
4. Ask the indexed dense and lexical paths for bounded candidate sets, then fuse them. Exact dot-product scoring is only a known-small-subset path or bounded candidate rerank. Do not fetch all vectors or run JavaScript BM25 over the entire eligible corpus.
5. Merge and deduplicate by entry. Keep the strongest matching passage as evidence; avoid giving a long entry a ranking advantage merely because it has more chunks.
6. Batch-load canonical source records, verify access and content hashes again, then construct bounded snippets and exact `/log/:id` links from trusted records.
7. Store a short-lived ranked-ID snapshot, bound to actor and query/filter/index version. Reauthorize every subsequent page.

Return matched entry IDs, current entry previews, field/contributor evidence and exact links, plus retrieval ID, effective mode, index version, coverage state and next cursor. Do not return vectors or another account’s index statistics.

Use lexical fallback when embeddings are unavailable, with an explicit returned mode/coverage notice. Search over fresh, unindexed authored text as well, so a just-saved note does not disappear while its embedding job waits. Enforce exact phrases or exclusions as predicates when requested; semantic similarity does not reliably implement logical NOT.

No model rewrites every query, no paid reranker by default, and no fixed bank of “interesting” searches. The agent separates meaning from constraints: “the time we discussed starting a garden” is semantic text; “with this person last April” supplies person/date filters. A request to open Log is navigation.

### Memory and scale

At 512 float32 dimensions, a vector is 2,048 raw bytes. The current roughly 506 text-bearing entries would need about 1 MiB of raw vectors; BSON number arrays, strings and runtime objects cost more. Persist packed float32 vectors in the new private collection rather than assuming JavaScript arrays use that raw size.

Use persistent incremental dense/lexical indexes for the production path. Keep a byte-bounded LRU for hot vectors or small candidate reranking, not a full graph copy per API process. Never silently truncate old history to fit a memory cap. At a million 512-dimensional float32 vectors, raw vectors alone occupy about 2.05 GB before metadata/index overhead, so the current host is not the intended large-corpus configuration.

The exact path has a measured, enforced threshold, initially at most 500 eligible vectors. Larger requests go to filtered indexed retrieval without first materializing the full eligible set. Canonical hydration processes bounded candidate batches; if stale/unauthorized candidates exhaust the request's work budget, report incomplete results rather than issuing an unlimited scan.

Benchmark 100,000 and 1 million total records, including a heavy private account and mixed filters, as well as the current small case. Measure filtered ANN recall against exact scoring and index freshness under concurrent writes. Incremental updates must not rebuild the corpus on the next read. Apply the same interface to existing public and private-chat search so Log does not become a third unrelated scaling workaround.

## 4. A report that is useful without a query

The report is a private, evidence-backed overview, not a replacement for the original records. Its value is discovery: a person can notice a theme, open the related memories, then ask their agent a better question.

Start with three kinds of card, only when supported:

- **Themes:** related entries collected around an actual activity or topic, with representative entry links.
- **People and activities:** recorded co-attendance connected to those themes and date ranges. This describes what was logged, not friendship quality.
- **Threads worth revisiting:** a recurring subject, an explicitly recorded idea, or a contrast between older and newer material. Mark interpretive connections as tentative and keep their evidence visible.

Counts must be stated as “in your Log” or “among these records,” never as a complete measure of someone's life. No entries is missing data, not evidence that an activity stopped. Future plans are not completed events. A shared entry or another attendee's note does not establish the viewer's preferences. Imported dates, entry edit dates and the times of the events are distinct.

Do not optimize posting frequency, likes, replies or social productivity. Do not turn quiet periods into problems to fix. Do not infer diagnoses, sensitive attributes, relationship quality or obligations. Do not silently write report conclusions into human profiles or the permanent agent prompt.

### Free foundation

Use entry vectors to form a small set of topic candidates within the viewer's eligible material. Combine those with already structured people/place/date facets. Use representative human titles/phrases as provisional labels, with original entries underneath. Keep sparse/outlier items available rather than forcing every event into a topic.

For a small corpus, use bounded exact similarity/clustering as a baseline. Production overview reads return materialized topics, counts and representative IDs. Initial builds run as bounded resumable jobs; subsequent source changes update affected aggregates/topics. An empty cache must not turn a page open into a full-history clustering job. Benchmark incremental centroid/topic maintenance against the exact small-corpus baseline; do not store an all-pairs graph.

This layer is useful even when generative AI is off. It requires no query embedding, no agent loop and no LLM call on page opening.

### Optional interpretation

When requested, create a bounded evidence packet from the factual overview. Use one structured generation to propose a few concise interpretations with mandatory source IDs and supporting spans. Include counterexamples and a spread of dates, not just recent or frequent items. Counts and dates come from code, not model arithmetic.

For corpora that fit the explicit input-token cap, compare that approach with one bounded pass over all eligible authored text as an evaluation baseline. The whole-corpus baseline may be simpler and more faithful than a multi-stage summary pipeline. Use whichever yields better supported conclusions per dollar and second in our evaluation. Do not assume extra retrieval/model stages are an improvement.

Store individual conclusions with their dependencies:

```ts
{
  id, ownerId, audience: 'private', sourceScope,
  kind: 'observation' | 'interpretation',
  text, evidence: [{ entryId, field, contributorId, span, contentHash }],
  eventDateRange, generatedAt, inputFingerprint, recipeVersion,
  support: 'direct' | 'tentative', status
}
```

A citation's existence is not proof that the prose is true. Schema/source validation is mandatory, and semantic support/attribution needs evaluation. Omit unsupported conclusions rather than padding a report to a fixed length. A dismissed interpretation stays dismissed until genuinely new evidence warrants reconsideration.

Reports are derived outputs, never new source evidence. Do not embed generated reports back into the same factual corpus or cite a prior report as proof of its own claim.

### Updating efficiently

A source change marks dependent topics/conclusions dirty. Give each report scope a generation that source invalidations also update; a worker publishes only through a conditional write against its captured generation, lease and consent revision. A fresh report read still revalidates source dependencies. Refresh deterministic counts/membership cheaply. Reuse unchanged topic labels and conclusion fingerprints. Coalesce changes into one job, with at most one report run per account at a time.

Do not schedule paid runs just because another day elapsed. Require a material evidence change and the relevant consent/budget. Time-dependent display labels can update without an LLM. Deletions, blocks and access revocations invalidate affected conclusions immediately, including their prose; removing only the citation would still leak the derived information.

Reads return stored, validated sections and never perform a full-history rebuild. Explicit generation and automatic maintenance both use bounded resumable jobs, dirty-section updates and input caps from the outset. Add automatic refresh only after the report demonstrates value. Large corpora must not trigger whole-report resummarization on each edit.

## 5. Consent and billing recommendation

The daily-spend toggle is a reasonable advanced control, but should not be the first thing the user encounters. First let them browse the free overview and request one useful interpretation. Offer automatic maintenance after they have seen what it produces.

| Work | Proposed payer / behavior |
| --- | --- |
| Base embeddings, hybrid search, factual topic overview | Platform-funded, following existing search policy. Reuse one indexed entry across attendees. |
| Reading an existing report or following its links | No AI charge. |
| User-requested interpretation | Actual model cost from existing credits, with an estimate/cap before starting. |
| Optional automatic interpretation updates | Default off; explicit source permissions, estimated daily cost and a chosen daily limit. |
| External CLI/MCP agent producing its own report | No hosted AI charge from New Drugs. The external agent bears its own model cost. |

OpenAI currently lists `text-embedding-3-small` at $0.02 per million input tokens. For illustration, 10,000 embedded tokens costs $0.0002; one million costs $0.02. These are embedding-only costs, not report generation or an assertion about this corpus's token count. Tokenize the actual deterministic documents in a dry run before estimating backfill. [Model pricing](https://developers.openai.com/api/docs/models/text-embedding-3-small)

The existing platform search budget defaults to $0.25 per stage/day and is shared with other search work. Preserve that cap. Add explicit `log_search` attribution; the current embedding helper classifies every non-public namespace as `chat_search`. Interactive searches should not be starved by report/backfill work.

For interpretation, estimate from the actual prepared input, current rate card, output limit and measured request overhead. Record estimated versus settled cost. A cold initial report can cost differently from an incremental update; show those separately. Do not advertise a fixed daily subscription price or assume a $0.05 automation default is appropriate.

If automatic updates ship, show:

- Which sources may be read, separate from the spending control.
- Estimated cost per update and expected daily range, including $0 on unchanged days.
- A maximum daily allowance and actual spend today.
- Last update, whether changes are pending, and whether credit/budget currently defers work.

Compute the estimate from representative benchmark runs initially, then the person's recent settled runs and actual update frequency. Use sub-cent formatting instead of displaying a misleading $0.00. Sparse estimates should be labeled as estimates, not made precise by averaging too little data.

Reuse isolated hosted runs, wallet reservations, actual provider settlement, generation fences and the account-wide automation allowance. The scheduler must count pending reservations atomically, not just settled spend. Existing automation billing caps the user's billed amount at the run budget; cancellation is not a guarantee that a provider has incurred no additional cost. Keep any provider overrun platform-side, cancel promptly, and test reserve/retry behavior. Avoid both silent excess user charges and hiding platform cost.

Disabling stops queued/new work and requests cancellation of an in-flight run. Already incurred usage can still settle. Re-enabling or raising the cap requires explicit user intent. Do not retry repeatedly against an empty wallet. Reuse existing ledger receipts, so recent report charges are inspectable and older ones naturally join **Agent usage rollup**.

A report read must never secretly trigger paid generation. Give paid refresh its own operation. Manual and automatic refresh share idempotent input fingerprints, so they cannot both charge to produce the same update.

## 6. Privacy, access and reporting scope

Private retrieval, public discovery and reports remain separate views of authorized evidence, even if they share embedding infrastructure.

- Every search page, report read, discussion handoff and source opening revalidates canonical access and content dependencies.
- `logAccess` is required for background Log search/report sections. `accountActivity` or `privateChat` alone does not grant it.
- Do not silently combine DMs, private agent chat and Log in the first report. Additional sources need explicit grants and provenance. Agent-written chat is not independent evidence of a user's preferences.
- Embedding text is sent to the existing provider; this processing must be accurately described in product/privacy documentation. Do not claim it stays on-device or assert unverified provider-retention guarantees.
- Keep private query caches actor- and stage-scoped. Public result payloads and public search indexes never contain private report material.
- Redact source text, query text and conclusions from operational logs. Log counts, timing, safe error codes and revisions.
- Use a reverse dependency index for report conclusions. Revalidate all dependencies of a conclusion; hide/recompute it if any necessary source changed or became inaccessible.
- A capability invite permits reading that one hangout. It is not permission for general user profiling or discovery indexing.

For other-person discovery later, reuse only currently public profiles/posts as source material. Produce private recommendations for the viewer, with concrete public evidence and no compatibility percentages. Compare the existing profile/post retrieval baseline before adding public author summaries. Never compute all user pairs in the background, and never publish a generated replacement profile.

## 7. UI, agent and CLI/MCP

Keep the calendar itself intact. The user previously removed the generic Log filter UI; this plan does not quietly restore it.

Recommended first surface: a dedicated **Explore** page reachable from Log's existing sidebar/settings entry points, containing the saved overview and a simple search affordance. It uses the existing native panel, cards and Log list. This is a working label, not final marketing copy. A report about broader account activity can later have an Agent entry point without changing the evidence engine.

A topic/conclusion opens its supporting entries in a preserved list. Opening an entry retains that list's order, scroll and Previous/Next behavior. Extend `LogSequence` with a discriminated semantic-result source/cursor; do not accidentally paginate a relevance-ranked list through chronological `log.list`.

Each interpretation can open its sources, be dismissed, or be sent into chat for further discussion. The chat handoff contains an authorized report/reference ID, not an untrusted blob of conclusions. The user should be able to use Explore without chatting. Transient loading indicators wait 500ms; pagination-edge indicators remain immediate.

Proposed operations, introduced only with their implementation phase:

| Operation | Responsibility |
| --- | --- |
| `log.search` | Hybrid retrieval with structured filters, exact links and actor-bound paging. |
| `log.search_status` | Caller-visible coverage/pending state; never other users' private counts. |
| `reports.get` | Read the current authorized overview/conclusions, freshness and coverage. No paid generation. |
| `reports.refresh` | Explicit bounded interpretation job, with quote/version, cap and idempotency. |
| `reports.preferences_update` | Source grants, automatic-refresh consent and budget; disable without extra approval. |
| `reports.dismiss` | Dismiss a conclusion without editing its source. |

Enabling ongoing paid work through an agent uses the app's exact review. Ordinary reads remain direct. Do not introduce bulk social-action APIs. External agents can read the same evidence and discuss it freely; an optional later report-publication interface can follow the existing external inbox model without buying a hosted run.

Agent guidance: use the report to orient, then retrieve current evidence when making specific claims. Never treat a cached conclusion as unquestionable truth. Preserve the no-em-dash and user-writing-style rules. Proactive ideas should benefit the person's expressed interests, not engagement metrics.

## 8. Implementation phases and acceptance gates

| Phase | Concrete work | Exit condition |
| --- | --- | --- |
| 0. Scaling groundwork and baseline | Fix the audit’s live/calendar/billing amplification; establish metrics, filtered retrieval backend and an isolated capacity workload. Compare exact small-subset recall and bounded summary baselines. | Indexed incremental retrieval and bounded reads pass the scale envelope; costs and hardware are explicit. No automatic paid production runs. |
| 1. Private search | Add projection/hash/outbox/worker/backfill; `log.search`; canonical eligibility and hydration; indexed dense/lexical candidates with bounded exact reranking; status and result navigation. | Correct access, old-history recall and acceptable cold/warm latency on dev. |
| 2. Free Explore | Incrementally materialized people/date facets and topic candidates, representative source cards and generation-bound reads. | Useful without paid interpretation; no forced topics or unsupported personal conclusions. |
| 3. Optional interpretation | Bounded evidence packet, structured conclusions, reverse dependencies, explicit refresh/quote, hosted-run billing and dismissal. | Grounded usefulness beats the simpler baseline at an acceptable measured cost; no charge to read. |
| 4. Automatic maintenance | Consent, daily estimate/limit, dirty-job coalescing, reservations, cancellation and deferral status. | Unchanged inputs make zero model calls; retries/concurrency cannot duplicate charges. |
| 5. Broader discovery | Opt-in extra personal sources and/or public-source people recommendations. | Demonstrated usefulness and explicit privacy boundaries, not merely reuse because vectors exist. |

Expected code areas: `server/search/log.ts` and shared Log-search contracts; `server/log.ts` and mutation/migration/delete hooks; `server/search/embeddings.ts` for batching/feature accounting; `server/db.ts`; `server/liveState.ts`; canonical catalog/contracts/resource links; Log result navigation; a small report projection/worker and native report panel. Reuse the existing hosted execution/billing layer rather than a second agent runtime.

## 9. Tests and operating limits

**Privacy/correctness:** cross-user and cross-stage isolation; blocks/suspension; shared-member removal; code-only viewer exclusion; edits during embedding; deletion during generation; migration backfill; lost leases; stale cursors; removed supporting evidence inside a generated conclusion; settings revocation during a run.

**Relevance:** paraphrases, exact names/places, sparse titles, long notes, ambiguous people, date-only boundaries, negation, contradictions, future versus past events, and truly absent answers. Include old entries so recency cannot mask recall failures. Use synthetic/private-approved judgments, not unreviewed extraction of real people's diaries into a public benchmark.

**Report quality:** independently inspect whether each conclusion is supported, attributed to the correct person and period, genuinely useful, non-repetitive and consistent with the site's ethos. Include “say nothing” cases. Automated source checks and LLM judges are aids, not the only truth test. Compare against ordinary chronological browsing and a single bounded summary call.

**Efficiency:** measure query embedding, database eligibility, vector scoring, hydration and rendering separately. Track warm/cold p50/p95, event-loop lag, RSS, queue lag, vectors reused/rebuilt, provider tokens, cost per successful search/report, and aborted/duplicate runs. Targets are provisional until measured: bounded retrieval work and acceptable p95 at the audit’s 1-million-record / 1,000-live-connection test envelope, bounded caches, one query embedding on a cache miss, zero document re-embeddings on unchanged source, and zero model calls for an unchanged cached report.

**Billing:** insufficient balance, simultaneous manual/automatic refresh, provider timeout with uncertain usage, exact input fingerprint retry, cap exhaustion, rate-card changes and late settlement. No double charging across report generation and later chat discussion of an already generated report.

Use flags to enable search, interpretation and automatic reports separately. Roll out synthetic/dev data first, then a bounded production backfill only when implementation is authorized. Disabling the feature must leave ordinary Log usable. No infrastructure upgrade, public-report launch, or reduced-motion branch is implied by this proposal.

## Decision to carry forward

The strongest first product is **a searchable Log with a useful private overview**, backed by a reusable, incrementally maintained retrieval index with bounded request-time work. Written insights are an optional interpretation of that evidence. Automatic daily spending should be earned by demonstrated value, not built into the premise.
