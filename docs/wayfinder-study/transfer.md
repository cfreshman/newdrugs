# What should transfer from Wayfinder

Status: working interpretation during the source study. Read this with the [source map](source-map.md) and [research log](research-log.md). This separates observed Wayfinder behavior, explicit new-drugs requirements, and proposed implementation choices.

**Latest direction:** Pangaea is a second reference for the social UI. Nothing is to be directly ported from either project. Throughout this document, “transfer” means adapting a behavioral principle into an original new-drugs design. The normal home is chat, with other interfaces available for the task at hand and a clear return to the conversation.

## The product I understand you to be asking for

New drugs gives a person a capable agent that can operate their social world inside the app. The initial visible interface is small because conversation is the main operating surface. The underlying capabilities still have to be real: reading current state, resolving people, carrying out requested actions, handling necessary human input, and finishing the work reliably.

The transferable part of Wayfinder is the system that makes that promise credible. A full operating contract connects the UI, CLI, MCP, model, domain operations, persistent execution, and billing. The agent can discover what the app actually supports. It works through the same rules and records as other clients. When it needs a human decision, the runtime presents the exact decision and carries the task forward afterward.

The visual shell is explicitly different. The user has already specified the circle, draggable chat, normal message bubbles, dictation controls, colors, typography, and restraint. Wayfinder's dashboards, drawer layout, promotional copy, navigation furniture, and business onboarding are not new-drugs requirements.

## Confirmed requirements and remaining interpretation

The requirement for human-written profiles is explicit. It applies to profile text and images and is a platform value, not a missing tool to bypass. The agent should be able to open the correct editing experience and continue from verified completion. It should not generate the person's identity or repeatedly tell them to navigate through forms.

The prohibition does not automatically settle every other authorship question. The user has not specified that all posts must be AI-written, or that all posts must be human-only. An agent must preserve exact wording when supplied, act on the user's actual request, and obtain any required publishing confirmation. This study does not invent an automatic content-generation or engagement system.

The current implementation introduced profile/city/discovery prerequisites for publishing. Those were not established by the user's instructions. The right response to that mistake is to define the social operation's actual domain contract, rather than keep adding onboarding instructions or silently change product policy whenever the model encounters an error.

## 1. One application operating contract

**Observed in Wayfinder:** the in-app agent connects to the same MCP implementation used by external clients. It loads the instruction resource, identity context, and available operation index. CLI and MCP call canonical domain operations and validate their projected output.

**Transfer:** every meaningful app capability needs one operation contract with an implementation, authority checks, exact input/output schemas, effects, confirmation policy, idempotency, result verification, and bounded reads. UI actions and external actions must agree on what happened. An agent should discover the available operation and use it instead of asking the person to translate their intent into route names or database IDs.

**Adaptation:** new drugs needs its own social operations and privacy rules. Wayfinder's CRM contacts, sales pipelines, organizations, commissions, and billing privileges do not become this app's data model. A small app can have a small catalog while still honoring the full contract.

**Specific exception:** profile authorship can be represented as a human continuation in the catalog. Capability coverage does not require exposing an agent-authorable profile mutation that contradicts the product rule.

## 2. A durable agent run

**Observed:** submission persists a user turn and queued run, then schedules execution. The Agents SDK's run state and session history survive interruptions. A worker has a time-bounded lease. Approval and decision checkpoints advance state versions. Maintenance can recover expired execution leases. A browser request is not the owner of the task.

**Transfer:** the chat must have separate submission, execution, observation, and cancellation paths. Closing a tab, reconnecting, waiting for a decision, or restarting a process must not create a second social action or erase knowledge of a completed action. The saved run carries the approved tool calls and results forward.

**Adaptation:** the existing MongoDB choice can support a durable queue, leases, transactions, ordered events, and SDK session storage. This needs to be deliberately implemented; a single Express request awaiting a provider stream is not an equivalent worker system. Convex's scheduler and subscriptions are implementation mechanisms, not mandatory dependencies for this app.

The current six-round, 2,000-output-token loop is not the reference behavior. Wayfinder permits substantial work and uses spend, byte, concurrency, and execution-window controls. New drugs should choose practical budgets for its host and user credit while providing an honest continuation path, rather than quietly abandoning a requested task after a handful of calls.

## 3. Host-controlled consequential writes

**Observed:** the model's execute tool does not accept a self-issued confirmation flag or choose its idempotency key. The host checkpoints an SDK interruption, resolves the operation's policy, records exact arguments and version, and either applies automatic policy or asks the human. Execution validates the saved decision against the same exact call.

**Transfer:** asking the model to “get confirmation” in a system prompt is insufficient. Confirmation must bind the precise recipient, content, visibility, deletion target, amount, or other material consequence. Changing those details invalidates the earlier approval. Expiry, rejection, cancellation, and permission changes must be enforced before execution.

Routine reversible actions should not acquire redundant confirmation dialogs just because they are writes. The catalog determines the boundary. This is a direct correction to my earlier tendency to add unnecessary user steps.

**External-agent distinction:** Wayfinder accepts explicit host attestation from an authorized external CLI/MCP host for operations that declare that proof. Its in-app model cannot mint that attestation. A new-drugs port needs the same separation between model-generated arguments and trusted host authority. Forcing all external work through browser confirmation would weaken the requested CLI/MCP surface; allowing the hosted model to confirm itself would remove the protection.

## 4. Bulk review and independent outcomes

**Observed:** a bounded task can produce many independent calls. The host saves them, shows individual decisions plus grouped review, and resumes the saved calls with bounded concurrency. It does not ask the model to recreate the calls after approval. A batch confirmation refuses a stale set before partially confirming it.

**Transfer:** “send these five invitations” should produce one coherent review of the actual people and text, with clear outcomes for all five. A declined action remains declined; a successful sibling remains successful. The user should not have to shepherd one API-sized fragment at a time.

An explicit domain bulk operation has an additional contract. Wayfinder's preview binds exact IDs and relevant current state to a digest. Execution rechecks that state and authority in one bounded transaction, refuses drift, and verifies the resulting state. Larger work is composed from chunks.

These are distinct guarantees: a grouped review is not automatically one all-or-nothing transaction across unrelated actions. The port must preserve that distinction, including partial success and uncertain provider outcomes.

## 5. Real conversation lifecycle

**Observed:** Wayfinder separates a short submission acknowledgement from the agent's running state. Draft ownership is scoped to the current user/context/thread. Clearing submitted text cannot erase newer text. Streamed drafts, final turns, failures, and runtime phase are different pieces of state.

**Transfer:** pressing send should immediately move the request into the conversation and clear the input, as explicitly requested for new drugs. Network acknowledgement then reconciles that same submission identity. A transport failure after acceptance is not proof that the request was never sent. Retry must first recover the existing submission/run rather than invent a new intent.

The visible conversation must survive refresh and reconnect. Partial text should remain available after a failure. If some actions already completed, cancellation or failure must report those outcomes accurately.

The draggable layout should preserve the visible bottom edge when its viewport changes height. That is different from blindly jumping to the newest message on every drag. A person reading older messages should retain their place. Streaming follows a reader who is already following the bottom.

## 6. Thinking and progress

**Observed:** Wayfinder asks the model for a short, task-specific commentary preamble. It routes that phase separately from final-answer text. Tool activity supplies actual discovering, reading, preparing, and verifying phases. The stream consumer serializes timed and size-triggered flushes so an older update cannot overwrite newer content.

**Transfer:** activity belongs in the assistant message flow and reflects actual work. It must not be canned “One moment” copy, an invented action log, or a dump of hidden reasoning. Preambles should remain distinct from the final answer, including after reconnect and persistence.

A standard Markdown renderer is part of usable AI chat: paragraphs, lists, emphasis, code, links, and tables should render normally. It must keep untrusted HTML and unsafe URLs from becoming executable UI. New drugs uses Noto Sans for ordinary conversation and UI, Noto Sans Mono for code, and Noto Serif where an intentionally serif text treatment is appropriate; it does not need editorial serif chat bubbles.

## 7. Human input as an owned continuation

**Observed:** Wayfinder's browser continuations are typed, constrained operations. Navigation is tied to the initiating client session and has explicit continue/finish semantics. File-upload submission verifies files and automatically creates the next turn in the same conversation. Closing a panel does not replay an old navigation action.

**Transfer:** when a human must edit a profile, upload a file, or complete checkout, the task must retain its context. The UI should report a real completion, cancellation, failure, or expiry. The agent resumes from verified application state, without asking the person to type “done” or assuming that opening a panel completed the action.

For new drugs, account creation immediately reveals profile creation. The profile fields remain human-authored. Saving a profile can complete a pending profile continuation in the same conversation. Closing an unrelated panel must not satisfy that continuation. A stale dialog must not send its result into another account, conversation, or run.

The current `{open: 'profile'}` tool result and uncorrelated modal callback do not provide any of these guarantees.

## 8. Actual file handling

**Observed:** file requests have purpose, ownership, content type, size, hash, staged/ready lifecycle, retention, and cancellation. Bytes are verified outside model arguments. The model receives trusted handles and untrusted file contents with that distinction preserved. Upload completion is connected to the conversation, rather than a detached storage action.

**Transfer:** support files as real conversation inputs and allow the agent to request them when they become the actual dependency. Show real upload and verification progress. Prevent a late upload from attaching to the wrong task. Do not claim a file was uploaded, read, or sent based only on a filename or a chosen file input.

**Adaptation:** Wayfinder's R2 implementation and organization billing are specific to its infrastructure. New drugs needs a blob-store boundary and ownership-checked delivery. A single-host private store can serve local development; production storage must have an explicit durability, access, retention, and cost policy. Putting public files or all binary data into arbitrary model arguments is not a port of the lifecycle.

## 9. Web search with evidence and cost

**Observed:** hosted web search is a real tool governed by a user preference. Search calls are metered separately from model tokens. Safe citations are extracted from provider results and retained in the delivered answer. Business records remain grounded in MCP.

**Transfer:** the hosted agent can research the external world when appropriate, with actual sources. It should use app operations for app facts and treat websites as untrusted data. An external agent can perform its own research without unnecessarily launching a second hosted model.

Enabling the tool without its cost meter, provenance, or result handling would be an incomplete port.

## 10. Cost accounting and authority

**Observed:** Wayfinder checks projected cumulative spend before every provider call and records idempotent deltas from cumulative SDK usage. Resuming saved state preserves usage while refreshing business authority. Provider costs, billable costs, and pricing snapshots are distinct.

**Transfer:** charge a recorded unit once, preserve the rate snapshot, and do not charge already-metered work again after a pause, retry, or checkpoint. Credit should be readable without asking a model. Direct CLI/MCP actions must not secretly invoke the hosted agent and spend its balance.

**Deliberate difference:** new drugs has no markup. Wayfinder's commercial markup rules are not transferable. Prices and provider usage fields must be verified independently before billing; blindly copying a reference rate formula is insufficient.

The user's net-zero principle also requires an honest decision about payment fees, transcription, web search, storage, and shared hosting. The prototype only covers model-token arithmetic and net Stripe deposits, while labeling hosting as operator-funded. It must not call that complete cost recovery. This study will document which costs can be attributed directly and which policy is still unspecified rather than inventing a hosting surcharge.

## What should not be transplanted automatically

- Wayfinder's business domains, enterprise roles, org billing, dashboard navigation, brand voice, and sales onboarding.
- Legacy V1 public surfaces or duplicate gateway implementations.
- Every optional specialist, report/artifact feature, game, automation screen, or connector simply because it exists in Wayfinder.
- Convex-, Clerk-, Vercel-, or R2-specific APIs where their guarantees can be preserved by a simpler implementation in the selected stack.
- Exact resource limits chosen for Wayfinder without considering the new host and product.
- UI copy, small text, heavy navigation, helper labels, or panels beyond the user's expressly requested interactions.

Useful later capabilities include durable scheduled work, private memory, reusable instructions, and richer social views. The immediate port should leave clean extension points for these while completing the core behaviors already requested. Calling them “later” must not be used as an excuse to omit durable runs, real approvals, uploads, or working search from the requested agent foundation.

## What I got wrong

I treated the first build as a small chatbot with a themed frontend. I invented product prerequisites, put too much behavior into a short prompt, added visible design elements the user had not requested, and then patched individual complaints without first tracing the reference architecture. Installing an SDK, declaring a few tool functions, and exposing a CLI command does not supply Wayfinder's operating behavior.

The next implementation needs to start with the canonical operation contract and durable agent lifecycle, keep the explicitly requested UI, and verify complete workflows before claiming that the agent can operate the app.
