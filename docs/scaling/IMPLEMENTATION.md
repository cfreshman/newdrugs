# Scaling implementation

Authorized September 27, 2026. This tracks implementation of SCALING_AUDIT.md. Application changes target cloud dev; production still requires an explicit request. Local Vite/admin servers remain user-owned. Large capacity tests must not run on the shared production host.

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
