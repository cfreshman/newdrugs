# Automations and an agent inbox

Research and adaptation proposal after v0.9.2. The founder asked to investigate Wayfinder's automations and useful incoming updates that can be brought into New Drugs' single chat. This document records that direction; no automation was created, enabled, or deployed during the study. Wayfinder was read only, including its tests; its code and services were not changed.

Implementation details now live in [the implementation notes](../automations-and-inbox.md).

## Confirmed direction

The founder confirmed the core direction: **non-primary-chat agents and external delivery**. Both producers should use one owned delivery record and the same inbox, links and chat-handoff behavior. Scheduling is one way to start a separate agent run; it is not a prerequisite for accepting an external agent's useful result.

The shared delivery contract should contain a stable ID, Markdown title/body, source links, creation time, read/archive state and optional source-run/automation references. Owner and producer identity come from authenticated server context, never from an arbitrary recipient or claimed agent name in a payload. For external calls, the connected credential supplies provenance and an individual idempotency key deduplicates retries. For hosted jobs, the execution supplies provenance, cost receipts and the publication key. External delivery does not start a hosted model call or consume New Drugs AI credit.

Candidate canonical operations are `inbox.publish`, `inbox.list`, `inbox.get`, `inbox.mark_read` and `inbox.archive`. A native inbox destination and validated context attachment provide the handoff to the existing chat. Direct UI, CLI and MCP share the same ownership and visibility rules. Historical deliveries remain identifiable after an automation stops or a connected credential is revoked, while future delivery authority ends.

## Product shape

An automation is a saved instruction with a trigger, selected context, a usage limit and a delivery policy. It can work while the person is away. Useful results arrive in an **Agent inbox**. Reading a result does not add anything to the main chat or start another paid model call.

The inbox belongs in the existing launcher panel. Start with updates and an Automations management view within that panel, using the app's existing cards and pill tabs. Keep social DMs/invitations in their existing surfaces. The notification bell can point to an unread inbox update, but the inbox item remains its durable content record. Count it once rather than making two independent unread events.

Each update has Markdown content, working internal/external links, its source automation or connected agent, when it was produced, and the source material behind it. Retain read updates; offer archive and a route back to the producing automation. Technical attempt logs belong in automation run history rather than becoming messages in the inbox.

**Bring into chat** adds the item as a visible context attachment to the existing composer and preserves any typed draft. The person can add a question and send. The server resolves the owned item and its sources when the message is submitted. The assistant receives the update as reference material, never as a new system instruction or proof of permission to act. Retries reuse the same handoff identifier. The resulting chat message points back to the update, and the update can point to that discussion later.

Links inside an update open their destinations directly. They must not trigger Bring into chat. Opening the inbox must not disturb the current chat position or pending reply.

## What Wayfinder actually provides

This investigation focused on **agent-runtime processes**, not the CRM email/SMS workflow builder.

| Observed implementation | Adaptation |
| --- | --- |
| Saved instruction, trigger, owner, daily run limit and active/paused/archived state | User-owned automation with ordinary manual management and shared operations |
| One-time and recurring timers with timezones, schedule generations and duplicate guards | Durable Mongo schedule/occurrence records and worker leases; old schedules cannot fire after edits or pause |
| Event admission checks current source access and limits; a source key deduplicates execution | Bind each run to the actual occurrence and authorized source versions |
| A proactive run gets a hidden thread and an independent provider session | Keep the independent execution/session, replace the hidden user-visible thread with a job record |
| Explicit `publish` or `silent_exit` output; silence remains visible in run history | Publish a useful inbox item or leave no inbox message. Never create repetitive “nothing new” updates |
| Publication and owner notification are separate | An inbox update need not send push. Push is a configured delivery choice |
| Owner-only notification can be allowed without business-write authority | Permit publishing to the owner's inbox without granting permission to DM, invite or post |
| Revision checks, permission revalidation, activation generations and bounded history | Preserve these protections across UI, hosted agent and external CLI/MCP |

Wayfinder's tests explicitly distinguish a genuinely useful update from a list of action items. An automation can share worthwhile information without manufacturing a task. They also cover stale edits, other-owner access, permission changes and silent completion. These are useful behaviors to retain.

## Useful starting examples

- “On Friday afternoon, find a few things near my saved area that fit this request. Include the current dates, prices if known, and source links.” A scheduled research instruction with explicit context and web access.
- “Tell me when a new public post nearby is looking for someone to make music with.” A meaning-based watch over new/changed authorized content, with a remembered delivery cursor so it does not keep reporting the same post.
- “Tomorrow evening, bring this thread back to my attention.” A one-time reminder that can be delivered deterministically without paying a model to repeat stored text.
- An external agent the user already runs can send a researched, source-linked update to the same private inbox through the CLI. New Drugs does not charge for its direct operation; the external provider's usage remains separate.

These are examples, not default jobs installed for every account. The owner chooses the instruction and the context available to it. An automation does not need blanket access to the entire private chat history to research a local event.

## The necessary New Drugs changes

The current hosted runtime is intentionally built around one foreground conversation:

- `reserveRun` sets `user.activeRun` and immediately inserts a user message into `messages`.
- Agent credentials currently authorize whichever foreground run is active for their owner, rather than one specific automation execution.
- `agentSessions` is keyed by user, and the hosted session carries the main chat's continuity.
- Wallet reserve/settlement paths contain assumptions about `activeRun` and one foreground hold.
- Completion writes into the main transcript. Native surface requests assume an initiating browser.
- Push currently supports invitation/message events and conversation destinations only.

A scheduler cannot safely call that path unchanged. Add an explicit run purpose and separate foreground/background authority. Each automation execution needs its own provider session, credential bound to that execution, saved configuration revision and allowed operations. Keep the existing foreground slot and transcript out of that execution. Foreground chat gets priority; background work can wait when capacity or available credit is limited.

Reuse the cloud-hosted agent integration, canonical reads, source links, semantic retrieval, usage accounting, leases and receipts. Adapt wallet accounting to independent per-run holds so concurrent work cannot spend the same balance or release another run's reserve. Read-only automation authority still needs server enforcement, including blocking native write tools and browser-opening tools.

Use separate records for the definition, occurrence/execution and inbox item. A uniqueness key on automation/generation/occurrence prevents duplicate scheduled admission. A publication key on execution prevents duplicate inbox messages after a retry. Connected-agent ingestion uses its own individual idempotency key and server-supplied owner identity. No recipient ID chosen by the model, no anonymous incoming webhook in the first version.

## Controls and cost

Manage the instruction, schedule/timezone, selected sources, last/next run, actual usage, pause/resume and delete directly. Chat and CLI/MCP use the same contracts. Saving a paused draft is reversible; activating recurring billable work needs a clear review of its instruction, schedule, permitted context and spend limits.

Run-count limits are useful but are not dollar limits. Hosted jobs need explicit per-run and aggregate spend allowances, enforced at admission and throughout execution, plus a clear paused state when credit or configuration is unavailable. Reserve and settle real usage using the existing cost ledger. A silent model run can still cost money; silence is not an accounting exemption. Platform-funded indexed search stays distinct from hosted model/web usage.

Inbox delivery is the default proposal. Push is opt-in with quiet/frequency controls. A simple reminder should use a scheduled record, and a semantic watch should check for changed candidates before deciding whether paid synthesis is needed. Do not wake a model continually over an unchanged dataset.

For the first build, research and owner-directed delivery are sufficient. Sending messages, invitations or posts from an unattended job is a separate authorization feature. Wayfinder supports more powerful write modes; the founder has not requested those here.

## First complete implementation sequence

1. **Inbox and chat handoff.** Durable owner-only items, Markdown/direct links, read/archive states, provenance, CLI/MCP ingestion and the explicit composer attachment. This is useful with external agents before a scheduler exists.
2. **One-time and recurring runs.** Independent hosted execution, schedule generations, budgets, explicit publish/silence, retries and pause/delete. Include manual Run now and inspectable execution history. Source permissions are checked again at execution and publication.
3. **Native data watches.** Start from a saved meaning/area filter. Reuse vectors and changed-source cursors, deduplicate deliveries and batch useful updates. Add more event types only for concrete requests.

The architecture is agreed; this sequence gives the implementation order. No live jobs or paid executions were enabled during this investigation. Groups for group posting remain a separate, deferred possibility.

## Cases to prove before shipping

Two devices activating the same job; duplicate timer delivery; a stale worker finishing after pause; timezone/DST changes; an empty or stale source; a deleted/blocked source at delivery and discussion; a revoked creator credential; interrupted usage reconciliation; two concurrent reservations; background work while the foreground chat is streaming; duplicate inbox ingestion; read/archive while push is queued; and bringing a result into chat with an existing draft.

Inbox content is private. Public semantic discovery must never index it. If private inbox search is added, it needs an owner-only dataset. A source that becomes inaccessible cannot be smuggled back into a fresh chat through a cached automation summary; mark the update unavailable/outdated as appropriate and reauthorize its reference context. Do not grant broader future access merely because the automation once had it.

## Source map

- [Wayfinder process contracts and publication outcomes](../../../wayfinder/convex/agentRuntime/processContracts.ts)
- [Occurrence admission, deduplication, ownership and hidden run creation](../../../wayfinder/convex/agentRuntime/processAdmission.ts)
- [Timer generations and schedule replacement](../../../wayfinder/convex/agentRuntime/processTimers.ts)
- [Explicit publication, silent completion and run history](../../../wayfinder/convex/agentRuntime/processCompletion.ts)
- [Owner-only notification and separate mobile push](../../../wayfinder/convex/agentRuntime/selfNotifications.ts)
- [Direct automation controls and execution history](../../../wayfinder/src/components/agent/AgentSettings.tsx)
- [Lifecycle and authorization tests](../../../wayfinder/tests-convex/agentProcesses.test.ts)
- [Silent-result and configuration tests](../../../wayfinder/tests-convex/agentProcessContracts.test.ts)
- [New Drugs foreground run and wallet assumptions](../../server/wallet.ts)
- [New Drugs hosted sessions](../../server/agent.ts)
- [New Drugs credential authority](../../server/auth.ts)
- [New Drugs current push delivery](../../server/push.ts)
