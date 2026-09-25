# Source map

These references were read from `/Users/work/dev/wayfinder`. Links point to the local working tree. They are evidence for behavior, not a promise that the same files can be copied unchanged into new drugs.

## Control plane

| Source | Behavior established | Transfer |
| --- | --- | --- |
| [CLI control-plane contract](/Users/work/dev/wayfinder/apps/cli/CONTROL_PLANE.md:1) | UI, CLI, MCP, and automations enter the same domain operations. Stable JSON, explicit bounds, ownership, idempotency, audit, and verification are part of the operation contract. | The central architectural requirement. |
| [MCP invocation](/Users/work/dev/wayfinder/apps/cli/src/mcp/invoke.ts:1) | Validates both request and projected response; read envelopes report pagination, writes report execution separately from verification. | Shared schemas and honest results. |
| [CLI operation commands](/Users/work/dev/wayfinder/apps/cli/src/commands/operationsV2.ts:1) | CLI uses the same catalog, principal, invocation functions, and confirmation policy. Supports structured file/stdin input. | CLI as another transport, not a parallel implementation. |
| [In-app MCP endpoint](/Users/work/dev/wayfinder/src/app/mcp/agent/route.ts:1) | Authorizes a run credential, rebuilds live authority, and instantiates the same MCP server used by external access. | One catalog and fresh authority for the hosted agent. |
| [Runtime authorization](/Users/work/dev/wayfinder/src/app/api/v2/_lib/runtime/authorization.ts:1) | Evaluates scope, capability, ownership-dependent access, and connection policy. | New-drugs ownership and social privacy rules; not Wayfinder's CRM/org roles. |
| [Authority credentials](/Users/work/dev/wayfinder/convex/apiKeys/agentRuntimeShared.ts:250) | Checks user, credential, thread, run, state version, lease, expiry, cancellation, audience, and deployment before authorizing. | A worker's authority must expire and be rechecked. |

## Hosted agent

| Source | Behavior established | Transfer |
| --- | --- | --- |
| [Submission](/Users/work/dev/wayfinder/convex/agentRuntime/interactiveCore.ts:128) | Idempotent client submission creates a durable turn/run and schedules work. Duplicates return the existing identity. | Separate accepting a message from generating its answer. |
| [Runtime construction](/Users/work/dev/wayfinder/convex/agentRuntime/agentTools.ts:721) | Connects to MCP, reads instructions and the available operation index, adds host tools, and wraps writes. | Reuse the real application operating layer. |
| [Write wrapper](/Users/work/dev/wayfinder/convex/agentRuntime/agentTools.ts:859) | Model cannot supply approval or idempotency. The host matches exact interruption, version, input digest, and approval policy before invoking. | Enforced consequential-write control. |
| [Runner](/Users/work/dev/wayfinder/convex/agentRuntime/runner.ts:473) | Uses the Agents SDK, restores saved state and usage, executes bounded work, streams drafts, checkpoints interruptions, and resumes approved calls. | Durable execution; do not replace with a short handwritten loop. |
| [Persisted interruption](/Users/work/dev/wayfinder/convex/agentRuntime/runtimeState.ts:1411) | Saves undecided state before decisions. Human-required actions pause; ordinary allowed writes receive host-policy approval. | Checkpoint all writes without asking humans to reconfirm every reversible edit. |
| [Decision checkpoint](/Users/work/dev/wayfinder/convex/agentRuntime/runtimeState.ts:1615) | Persists applied decisions at a new state version before execution resumes. | Crash-safe approval application. |
| [Approval decisions](/Users/work/dev/wayfinder/convex/agentRuntime/interactive.ts:535) | Decisions require the exact owner, active run, state version, and unexpired request. Batch approval preflights all pending decisions. | Individual and grouped review. |
| [Expiry](/Users/work/dev/wayfinder/convex/agentRuntime/approvalExpiry.ts:1) | Expired actions do not run. Once a batch is settled, the saved run resumes with those outcomes. | Expiry is a state transition, not a dead end. |
| [Maintenance](/Users/work/dev/wayfinder/convex/agentRuntime/maintenance.ts:1) | Reclaims expired leases, queues due retries, settles stale approvals, and cleans state objects in bounded batches. | Worker recovery and cleanup. |
| [Shared limits](/Users/work/dev/wayfinder/shared/agentRuntime/limits.ts:1) | Large task ceilings coexist with byte limits and bounded write concurrency. | Avoid tiny artificial task limits; choose infrastructure-appropriate resource budgets. |

## Conversation state and user experience

| Source | Behavior established | Transfer |
| --- | --- | --- |
| [Submission UI](/Users/work/dev/wayfinder/src/components/agent/AgentProvider.tsx:418) | Submits once with a client submission ID and originating client-session ID. | Stable identity through acknowledgement/reconnect. |
| [Composer lifecycle](/Users/work/dev/wayfinder/src/components/agent/AgentProvider.tsx:1759) | Separates submitting from running; clearing a submitted draft does not overwrite a newer draft. | Immediate feedback and safe reconciliation. New drugs explicitly wants immediate clearing. |
| [Draft ownership](/Users/work/dev/wayfinder/src/components/agent/useAgentComposerDrafts.ts:1) | Drafts belong to a context/thread, remain in provider memory, and clear only when the submitted text still matches. | Prevent cross-account/thread leakage and late-response erasure. |
| [Streaming](/Users/work/dev/wayfinder/convex/agentRuntime/streamingDraft.ts:1) | Distinguishes commentary from final output, preserves segment boundaries, flushes on time and size, serializes writes. | Real progress in the message flow without generic waiting copy or mixed phases. |
| [Status labels](/Users/work/dev/wayfinder/shared/agentUi/runStatus.ts:1) | Uses task-specific model preambles and real runtime phases; failures and ambiguous outcomes have distinct meanings. | Truthful activity and error reporting. |
| [Draft persistence](/Users/work/dev/wayfinder/convex/agentRuntime/runtimeState.ts:1006) | A draft update is fenced by a live lease, run status, and cancellation state. | A stale worker cannot overwrite a newer answer. |
| [Scroll behavior](/Users/work/dev/wayfinder/src/components/agent/AgentScrollArea.tsx:1) | Resize preserves the visible bottom edge at any scroll position; streaming follows only an already-following reader. | Port the invariant into the draggable chat, omit Wayfinder's padding and scrollbar gutter. |
| [Dictation](/Users/work/dev/wayfinder/src/components/agent/useAgentDictation.ts:1) | Capture generations invalidate late results; speech/recording/transcribing are explicit states; context changes cancel capture. | Use the requested blue/red/green orbs around this behavior. |
| [Session storage](/Users/work/dev/wayfinder/convex/agentRuntime/convexSession.ts:1) | Stores complete SDK conversation items, checks snapshot revisions, and avoids compacting unresolved function calls. | Preserve tool context and valid call/result pairs. |
| [Usage-preserving restoration](/Users/work/dev/wayfinder/convex/agentRuntime/sdkState.ts:1) | Replaces stale business context while preserving cumulative SDK usage. | Correct authority and billing after resume. |

## Files, client actions, and billing

| Source | Behavior established | Transfer |
| --- | --- | --- |
| [Client navigation](/Users/work/dev/wayfinder/convex/agentRuntime/agentTools.ts:1112) | Navigation is an explicit user-requested action with a defined continue/finish choice, rather than a generic panel side effect. | Typed, scoped client actions. |
| [Upload request tool](/Users/work/dev/wayfinder/convex/agentRuntime/agentTools.ts:1134) | Requests files when bytes become the real dependency. The model receives verified handles, not pasted base64 or local paths. | Upload requests in the conversation. |
| [Upload state](/Users/work/dev/wayfinder/convex/agentRuntime/fileUploadState.ts:370) | Finalization binds owner, purpose, object key, size, content type, and hash. | Verified file lifecycle. |
| [Upload submission](/Users/work/dev/wayfinder/convex/agentRuntime/fileUploadState.ts:496) | Submitting a ready upload retains references and creates the next user turn automatically in the correct thread. | Continue without asking the user to say the upload is done. |
| [Upload UI](/Users/work/dev/wayfinder/src/components/agent/AgentFileUploadCard.tsx:1) | Reconciles local uploads with published server metadata, with ready/error/cancel states. | Real progress and recovery, not decorative file chips. |
| [Web search](/Users/work/dev/wayfinder/convex/agentRuntime/webSearch.ts:1) | Counts hosted searches separately and extracts safe, deduplicated provider citations. | Actual search plus sources and separate tool cost. |
| [Spend gate](/Users/work/dev/wayfinder/convex/agentRuntime/spendGuard.ts:1) | Before each provider call, checks cumulative projected spend for the attempt. | Spend control independent of arbitrary model-turn counts. |
| [Usage checkpoints](/Users/work/dev/wayfinder/convex/agentRuntime/runtimeState.ts:200) | Bills deltas from cumulative usage, with idempotent segment identities and price snapshots. | Avoid charging prior work again after approval/resume/retry. |
| [Encrypted state store](/Users/work/dev/wayfinder/convex/lib/agentRunStateR2.ts:1) | Versioned immutable state objects, identity binding, integrity checks, encryption, and bounded reads. | State integrity and privacy; storage backend can differ. |

## Reference tests run

These are existing **Wayfinder tests**, not new-drugs tests. No Wayfinder product source was edited. No further reference tests will be launched there; the port needs its own validation in new drugs.

Reference tests are inspected as source only. Current validation runs New Drugs tests; this work does not execute Wayfinder test suites, edit its source, or restart/deploy either reference app.

The test log is at `.data/research/wayfinder-tests.log` in new drugs. It is ignored by git. This verifies the reference behavior under its tests; it does not verify new drugs or a live provider integration.

Further source checks and any gaps found will be added during the study.
