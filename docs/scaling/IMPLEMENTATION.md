# Scaling implementation

Authorized September 27, 2026. This tracks implementation of SCALING_AUDIT.md. Application changes target cloud dev. The user has now authorized production once the entire requested batch is ready and validated, explicitly forbidding a premature production rollout. Local Vite/admin servers remain user-owned. Large capacity tests must not run on the shared production host.

## Work remaining

- Targeted, coalesced live invalidation, shared account projections, cross-instance connection leases and view interests.
- Batched Log projection/authorization, incremental calendar ranges and bounded DOM.
- Maintained billing period summaries, covering all ledger writers and reconciliation.
- Persistent filtered public/private retrieval and incremental indexing, with canonical authorization and bounded fallbacks.
- Separate web/worker process roles, configurable fair admission and efficient schedule calculation.
- Authorized streamed/range media delivery, shared object-storage backend and safe migration tooling.
- Indexed attachment references instead of history-sized file filters.
- Shared rate limits, multi-instance deployment readiness, instrumentation and reproducible isolated scale tests.

## Validation and rollout

Record each milestone's actual tests and dev release here. Never describe unit/mock tests as a live million-record benchmark. Infrastructure that needs new services/credentials will be prepared concretely before requesting any necessary access or spending approval. The optional semantic report product remains subsequent work unless separately requested.

## Report/memory steering during implementation

The founder proposed Wayfinder-style user instructions plus agent-owned memory. The plan now records individual core/non-core slots, per-slot revision/idempotency, a combined bounded core-context read, optional semantic non-core retrieval and API pressure feedback (used/remaining/limit). These do not replace permission checks or the scaling work. Current focus remains infrastructure/data-path scaling; no recurring report billing has been enabled.

## First milestone

Implemented transaction-bound Log invalidations carrying current/former audiences and changed entry dates, per-account live projection sharing, visible-panel topic interests, coalesced record events, cheap socket heartbeats, shared Mongo-backed connection slots, bounded projection concurrency and hashed sent-state fingerprints. Log page hydration batches people/files. The weekly scheduler jumps through candidate dates with Temporal rather than scanning minutes.

Validation so far: 90 core domain/Log/scheduler tests; 105 UI/synthetic-fanout checks; two cloud-isolated live isolation/lease checks; 90 push/App checks. Counts overlap. The synthetic live test runs 1,000 in-process connections with mocked storage; it verifies scoped fanout and shared reads, not real network/database capacity.

Requested notification behavior: service-worker clicks signal existing windows or append a one-shot cold-launch marker. The app opens Notifications after initialization, retaining the exact destination underneath. Ordinary launches are unaffected.

First milestone deployed to dev `20260927182839343`; build and database-backed health check passed. Production is unchanged. Billing materialization and the remaining audit items are still in progress.

## Second milestone

Billing activity now uses derived receipt contributions and period summaries, transaction-bound update jobs, and resumable bounded backfill. Reads fetch a bounded set of periods plus the latest three charges, without folding the raw history. Late/backdated boundaries trigger bounded repair jobs. Balances and the canonical ledger are unchanged; the UI reports indexing while derived data is pending. Log authorization checks suspended members of actual candidate entries instead of enumerating suspended users globally.

Validation: TypeScript and 71 Log/domain/billing integration checks passed, including late reconciliations and backdated credits. These are correctness checks, not the planned 100,000-receipt benchmark.

User corrections included in this batch: invitation/history actions use the existing pill button; Log notifications and push identify the actor and current authorized hangout title. Messages/invitations identify their sender without exposing message text. Three targeted notification/privacy integration checks passed. Existing first-contribution-only notification semantics remain.

Second milestone deployed to dev `20260927184519136`; health passed. Production remains v0.29.2 by design until the complete batch is ready.

## Third milestone

Implemented shared Mongo request counters with explicit route namespaces, atomic increments, hashed client keys and expiry independent of TTL cleanup. API/media budgets remain separate. Web-only and worker-only roles are configurable; default `all` preserves the current deployment. Agent concurrency/interactive reserve and Mongo pool size are configurable. These roles have not yet been split into separate cloud processes.

Authenticated and code-scoped media delivery now streams with backpressure and single-range/HEAD support. It caches only bounded verification metadata, checking file identity/size/timestamps and rehashing changed files. Authorization remains fresh on each request. Native model file input still uses its bounded upload buffer. Object storage and migration remain unfinished.

Calendar rendering now virtualizes distant weeks with measured row/picker heights and stable date keys. Zero-size hidden observations do not discard the viewport. Log deltas hydrate changed entries instead of all loaded history; birthdays no longer reload for ordinary Log edits. Range data itself is still accumulated by the old loader and is the next calendar task.

Validation: TypeScript; two shared-counter/media-budget checks; two streaming/checksum/range checks; 33 combined calendar/Log/media/request-limit checks. Nine invite preview/privacy checks and nine other starter/push/admin checks passed; the one outdated generic notification assertion was corrected to the requested actor wording and passed separately. Browser fixture verification showed 32 mounted weeks for 104 logical weeks and exact preserved scroll after hiding/reopening. Synthetic fixture/tab removed. No user data or social actions were created for the browser check.

Below 640px the Agent chat uses full available viewport width with normal gutters; 15 mobile/position checks passed.
