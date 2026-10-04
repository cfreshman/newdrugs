# Scaling audit

**Historical pre-fix audit.** The corrective batch is shipped. Read current source, [implementation status](scaling/IMPLEMENTATION.md) and [review fixes](scaling/REVIEW-2026-09-27.md) before treating a finding below as still present. The proposed load/recall gates remain useful and do not constitute achieved capacity.

September 27, 2026. Code-level findings and corrective plan, not a load-tested capacity claim. No application code, infrastructure, stored data or deployment was changed for this audit.

## Answer

**Yes: several shipped implementations have small-system limits.** The initial semantic-search proposal also relied too heavily on today's small corpus. Exact scoring is useful for bounded subsets and as a correctness baseline, but an unrestricted scan is not the production scaling strategy.

The problems span distinct dimensions: more simultaneous users, more historical records per user, more public content, more background work, and more media. Increasing the droplet size alone does not fix the algorithms below. There is no measured safe user-count claim for the current app.

## Confirmed findings

### 1. Live updates have a connection ceiling and broadcast unrelated changes

**Priority: first.** [server/liveState.ts](../server/liveState.ts)

The API process caps live connections at 128, with eight per account. Those are connections, not registered users. A Log entry change sends `log/people/posts` invalidations to every subscriber; uploads and several public collections also broadcast broadly. The server iterates over subscribers, and recipients can refetch substantial views even when the changed record is unrelated to them.

Each connection's 15-second heartbeat also schedules a wallet projection, including database reads. Identical projections are suppressed on the wire only after they have been read/computed. Multiple tabs repeat that work.

**Replacement:** affected-account/record routing, explicit visible-view subscriptions, coalesced invalidations and per-account projection sharing. Preserve removal audiences on deletes with an outbox/tombstone so former viewers also invalidate access. Keep socket heartbeats cheap; refresh wallet on ledger/hold changes and bounded reconciliation, not on every connection heartbeat. Define multi-instance event routing and shared limits before adding API replicas. Do not merely raise 128.

**Gate:** 1,000 synthetic connected clients, including multiple tabs, with an unrelated user's Log write causing no private Log/calendar fetches in other accounts. Measure fanout, database reads and bounded output queues.

### 2. Public semantic search has a real 10,000-document ceiling

**Priority: first.** [model.ts](../server/search/model.ts), [index.ts](../server/search/index.ts), [retrieve.ts](../server/search/retrieve.ts), [worker.ts](../server/search/worker.ts)

The capacity includes indexed profiles, posts and replies, not 10,000 users. New indexing work is refused at capacity. On the next query after a corpus-generation change, the process builds a new full native HNSW index. The old graph can coexist with the new graph until active readers release it.

Even though dense lookup uses HNSW, each query scans the metadata to build its eligible set and performs lexical scoring across that set. It is not an entirely indexed sublinear query path.

**Replacement:** a persistent, incrementally updated retrieval backend with indexed filters and lexical/dense candidate generation. Keep Mongo as source of truth and retain canonical authorization/hydration. Separate search capacity from API process memory. Use versioned indexing jobs, deletion propagation and reconciliation. Remove the small fixed-document ceiling through a capacity-tested backend, not an unbounded in-process graph.

**Gate:** test beyond 10,000 documents, then 100,000 and 1 million. Index updates must not make the next query rebuild the corpus. Measure filtered recall against exact scoring, concurrent writes/queries, RSS and tail latency.

### 3. Private chat search reads all matching owner chunks for each new search

**Priority: before adding more private semantic datasets.** [server/search/chat.ts](../server/search/chat.ts)

Streaming bounds a batch's memory, but does not bound total query work. Search scores every matching chunk for the account; `indexedSources` also grows with the searched history. The keyword fallback uses text regex matching. A long-lived heavy user can become slow even with few total users.

**Replacement:** the same retrieval interface used for Log, with private owner/member filters applied inside the index, bounded candidate retrieval, and final canonical reauthorization. Exact scoring remains a bounded fast path and evaluation oracle. Do not replace the owner scan with global top-k followed only by permission filtering.

**Gate:** 100,000 chunks for one synthetic account, unrelated accounts alongside it, bounded documents/bytes returned to the API, and zero unauthorized results or snippets.

### 4. The new billing rollup recomputes long periods on read

**Priority: early, before recurring reports add more receipts.** [server/walletActivity.ts](../server/walletActivity.ts)

I introduced this in the recent rollup feature. It is correct about totals, but it streams raw ledger entries until the requested groups are complete. A person with one credit allocation and years of charges can cause most of their receipt history to be reread. Limiting the response to 30 rows does not limit this work.

**Replacement:** materialized credit/adjustment-period totals with receipt contributions, maintained idempotently from canonical ledger changes. Keep the most recent three charges separately, subtract their contributions from displayed period totals without losing precision, and retain actual oldest/newest dates. Handle late usage reconciliation, refunds, zeroed receipts and imported/backdated data. Financial balances and the raw ledger remain authoritative.

Backfill summaries in bounded batches and compare them against the current exact fold before switching. An outbox/reconciliation mechanism must cover every ledger writer, not only chat completion. If a derived summary is pending, do not misrepresent it as a complete total.

**Gate:** 100,000 charges in one period; subsequent activity reads have bounded work independent of receipt count. Concurrent credits and late adjustments produce the same totals/date ranges as the exact ledger oracle.

### 5. Log pages amplify database reads

**Priority: early.** [server/log.ts](../server/log.ts), [profileVisibility.ts](../server/profileVisibility.ts)

A list page is capped, but it projects entries one at a time. Each entry separately loads attendees and files; profile visibility can trigger additional lookups per attendee. The same people may be re-read many times within one page.

Several access paths also enumerate all suspended accounts before filtering results. Log contacts aggregate over the caller's entire shared history. These costs grow with history or global moderation data, rather than just the returned page.

**Replacement:** a batched page projector: fetch page entries, unique people/files and relevant relationships in bounded batches, then project in memory. Reauthorize the actual candidates instead of downloading the global suspended-user list. Maintain derived per-person co-attendance counts for the contacts surface where needed, with exact canonical checks on use. Verify query plans for common date/member filters.

**Gate:** a 30-entry page with repeated and distinct attendees uses a bounded number of reads, not a read per entry/person. More unrelated suspended accounts must not linearly increase every page request's payload/work.

### 6. Calendar refresh and rendering grow with everything already loaded

**Priority: early, alongside live updates.** [src/LogCalendar.tsx](../src/LogCalendar.tsx), [PreservedPanels.tsx](../src/PreservedPanels.tsx)

The calendar fetches all entries in each loaded 52-week range through repeated 30-item pages. A `log` invalidation reloads the entire range loaded so far and all recurrence entries. Its refresh handler also runs while the preserved calendar is hidden. All loaded week DOM and entries remain mounted. Memoization reduces incidental rerenders, but not the size of the accumulated data/DOM.

**Replacement:** range-keyed caches, entry/version deltas and targeted dirty-range refresh. Fetch only needed page/range data plus an explicit prefetch window. Virtualize distant weeks while preserving logical infinite scrolling, exact scroll anchors, day pickers and drafts. Retaining navigation state does not require retaining unlimited DOM. Keep a bounded active-panel cache and serialize inactive drafts/anchors where necessary.

**Gate:** decades of scrollable calendar history without proportionally growing mounted DOM; one note edit refreshes only its affected record/range; opening/closing overlays preserves position. Run the actual checks on a narrow mobile viewport as well as desktop.

### 7. Workers and API share a process; agent concurrency is four per process

**Priority: before automatic reports.** [server/index.ts](../server/index.ts), [agent.ts](../server/agent.ts), [automations.ts](../server/automations.ts), [automationSchedule.ts](../server/automationSchedule.ts), [push.ts](../server/push.ts)

Interactive/background agents, search indexing, scheduling, push and HTTP run in the same process. Hosted agent work is capped at four active runs per process. Search workers process small bounded batches; push delivery is serial per worker. These are protective throughput bounds, not scaling machinery by themselves.

Scheduling weekly automations searches minute by minute for up to nine days, using date formatting in the loop. That is bounded, but expensive when many schedules become due together.

**Replacement:** separate web and worker process roles; scale workers using durable leases, global/per-account fairness, provider rate limits and budget admission. Interactive work takes priority over report/backfill jobs. Use a calendar-aware next-occurrence calculation that preserves DST behavior instead of scanning every minute. Add queue-age metrics, retry backoff and overload/deferred states. Test concurrency across processes rather than assuming one-process correctness transfers automatically.

**Gate:** concurrent interactive requests plus a large due-automation/report burst do not block the HTTP event loop or starve chat. Mock provider calls for load tests; do not generate a large real AI bill to test the queue.

### 8. Media is tied to one machine and reads whole files into memory

**Priority: before horizontal API scaling or substantial media growth.** [server/uploads.ts](../server/uploads.ts), [server/app.ts](../server/app.ts)

Uploads live on the droplet filesystem. Reads load and hash the full file before returning it, including requests that need only a byte range. Upload/image conversion also buffers data. Per-account quotas do not cap total platform storage or concurrent buffering.

At the configured 64 MiB per account, 1,000 fully used accounts represent 62.5 GiB; 10,000 represent 625 GiB, excluding database/index overhead. Those are quota arithmetic, not usage forecasts.

**Replacement:** shared object storage with immutable verified objects, private authorization, streamed/range delivery, and bounded media-processing concurrency. Keep live invite-code revocation and account permissions intact. Public and private delivery need different cache rules; do not blindly cache capability URLs on a public CDN. Add total storage/object-count accounting and capacity monitoring.

The existing account-scoped browser photo cache is useful but does not replace server-side storage capacity or shared delivery.

### 9. Storage attachment filtering can scan a user's history before paging files

**Priority: second tier.** [server/storage.ts](../server/storage.ts), [logAttachmentLocations](../server/log.ts)

The attachment-location filter gathers all matching file IDs from a person's posts/chat/Log before applying the file-page limit. A single file can also have an unbounded list of attachment locations. The result is paginated, but upstream work is not necessarily bounded.

**Replacement:** an indexed attachment-reference collection keyed by owner/file/source kind/source ID, maintained with source mutations. Query file pages by attachment kind without constructing a history-sized `$in` list. Page or bound attachment-location expansion separately, retaining exact authorized destination links.

### 10. Multi-instance operation and capacity are not validated

**Priority: a release gate for growth, not a claim everything needs replacement.** [server/index.ts](../server/index.ts), [server/requestLimits.ts](../server/requestLimits.ts), [server/app.ts](../server/app.ts), [scripts/deploy.mjs](../scripts/deploy.mjs)

Both environments share a roughly 1 GB host. Request limiters use default process-local storage, application caches are local, media is local, and deployment restarts the stage's single API service. Existing database transactions and worker leases are helpful, but there is no demonstrated multi-instance capacity envelope or zero-downtime rollout.

**Replacement:** separate web/worker roles, shared limits where required, consistent event routing, shared media, health-based rolling activation and measured Mongo/search sizing. Establish realistic connection pools, provider quotas and backpressure. Source-of-truth Mongo can remain; this audit does not establish a need to rewrite the app on another database.

The founder's earlier backup decision remains a separate topic. This audit does not silently introduce a backup project or authorize new infrastructure spending.

## What is worth retaining

Stable internal IDs, exact resource links, cursor pagination in core collections, transaction-bound wallet writes/idempotency receipts, scoped authorization, persistent job leases, source revalidation, account-scoped bounded photo caches and current media quotas are useful foundations. They reduce migration risk and correctness work.

They are not proof that the complete system scales. The replacements should preserve these contracts while removing unbounded reads, global fanout and per-process capacity dependencies.

## Proposed order

1. Add metrics and a reproducible synthetic workload. No stress tests on the shared production host.
2. Fix targeted live invalidation and Log/calendar amplification; materialize billing periods.
3. Introduce the indexed retrieval backend for public search, private chat and new Log search. Retain canonical authorization and exact-recall test oracles.
4. Separate worker roles and fix schedule calculation before enabling automatic reports.
5. Externalize media and establish multi-instance web operation before larger concurrency/storage commitments.
6. Add the report's user-facing features on this foundation; cached report reads must remain bounded.

Some tasks can be developed independently, but do not launch reports on top of the known scan/fanout paths and call the result scalable.

## Explicit test envelope

Proposed engineering acceptance workload, not a capacity promise or an approved server purchase:

- 10,000 synthetic accounts, 1,000 concurrent live connections.
- 1 million indexed source/chunk records across datasets, including one heavy private account with 100,000 chunks.
- 100,000 billing receipts for one account, with refunds and late corrections.
- Decades of Log weeks and a dense year of entries on a mobile viewport.
- A burst of 1,000 due automations/reports alongside interactive traffic, with mocked provider responses.

Measure separate resource slopes as data and concurrency increase. User-facing reads should be bounded by page/candidate count rather than total history; work needed for complete aggregates belongs in incremental materialization/background jobs. Invalidation fanout should track affected viewers. Index updates must be incremental. Queue throughput must scale without unbounded memory, duplicate actions or billing errors.

Set concrete p95/queue-lag/resource budgets in the benchmark harness before implementation is considered complete. Record hardware and dataset distributions with results. Do not convert a unit-test pass, a cap increase or a single-user happy-path measurement into a “supports N users” claim.
