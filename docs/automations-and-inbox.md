# Agent inbox, automations, sleep and account controls

## Surfaces

The first three launcher entries are Agent inbox, Automations and Chat history, separated from the social entries by one intentional rule. The inbox retains read updates and an archive. Each update renders Markdown and direct links, identifies its authenticated producer, and offers Bring into chat. This attaches an owned reference to the existing draft without sending it or losing the draft. Submitting that draft resolves the update and current source permissions on the server.

Automations have a manual editor, a review before enabling, pause/edit/remove controls, Run now, and execution history. Clickable example prompts send immediately to the primary agent while preserving an existing draft and its file/inbox attachments. They cover actionable morning context, Monday friend discovery, and Friday local research. Saved instructions preserve the original request, adding only needed execution direction. Changing account facts are fetched each run rather than copied into the instruction; explicit user-selected criteria remain fixed. Shared base rules are not repeated in every saved prompt. They do not silently enable an automation: the agent saves a paused definition, then submits the exact revision for the normal review.

Account in Settings supports username and password changes with the current password, and an explicit irreversible chat-clear confirmation. User IDs remain stable. Password changes sign out other browser sessions. Clearing chat cancels affected primary/private-context runs, releases their holds, clears messages and their private search records, tombstones external chat-append receipts, and schedules deletion of provider sessions. Provider deletion briefly waits for pending usage reconciliation, with a five-minute cleanup deadline if reporting never arrives. A conversation generation resets cached history and outboxes in open tabs. Old provider sessions cannot become the active session again if they finish creating after a clear.

## Execution and authority

Hosted automations use the existing Agents API and model, with a distinct provider session and credential bound to each execution. They do not set the foreground `activeRun`, write primary-chat messages, or open browser panels. Public app reads are allowed; private social account activity (connections, invitations, DMs, notifications and action history), agent-chat reads and web research are separate explicit configuration choices. Account-activity action history includes only social actions; it excludes private chat receipts and other automation definitions. Its notification view excludes private agent-inbox updates and primary-chat reviews. Existing definitions default the new account-activity scope off until edited and reviewed. Background authority is rechecked against the active definition/generation and, when created through an external credential, that credential's continuing write access. Revoking the connection pauses its definitions and cancels pending work.

The background agent chooses an explicit `publish` or `silent` result. Publication creates an owner-only inbox update at completion; silent completion remains visible in run history without an inbox item. Publication is fenced against pause/edit/revocation and deduplicated by execution ID. Source links, including internal links in Markdown, are checked on delivery and again on reads/handoff. Unavailable source material is not injected into a fresh discussion.

`inbox.publish` uses the connected token's identity and label, not a model-supplied recipient or producer. It does not start a model or spend New Drugs credit. Individual idempotency keys use the canonical operation receipts. Inbox capacity is 2,000 records and new delivery is limited to 200 per account/day; old records can be archived or explicitly deleted.

## Schedules and limits

Schedules support one future UTC instant or selected weekdays at a local wall-clock time in an IANA timezone. Selecting all weekdays means daily. The next-time calculation handles daylight saving: nonexistent times are skipped, and a repeated fall-back date is not scheduled twice. A paused definition has no next run. Activation/reconfiguration generations invalidate old timers and work. A delayed scheduler admits one due occurrence and then computes the next future occurrence rather than replaying every missed day.

The default maximum charge is $0.05 per hosted run and $0.20 of daily allocations per automation. The configured per-run range is $0.01–$0.50; daily allowance is up to $1. All automations share a $1/day account allocation ceiling, reset at midnight UTC. Pending or incompletely metered executions count at their approved maximum until actual usage is known. One unfinished background execution per account prevents overlapping automatic work; the worker keeps capacity for primary chats.

Each run reserves its own allowance. Settlement cannot release or spend another run's hold. Reported provider costs are recorded separately from the charge, which is capped at the approved run allowance. Usage is polled during background work; any provider overshoot between checkpoints is absorbed rather than billed above the user's cap. The provider API does not supply a per-session dollar ceiling in the installed contract, so these are application billing/admission limits, not a claim of exact provider-side termination. Background executions also have a 100-read and five-minute active-work bound.

## Sleep

`newdrugs_sleep` accepts a future UTC ISO timestamp or duration in seconds, plus a reason. It must be the only pending function call. Sleep lasts from ten seconds to seven days. The host saves the pending call, leaves its result unsent, releases the worker lease and stops observing the stream. No model execution is requested while asleep. The run's unused credit hold remains visible in the wallet until completion/cancellation.

At wake, the worker subscribes first and returns the saved function result with a stable idempotency key and persisted wake time. Replayed sleep calls receive that same result rather than scheduling another sleep. The owner can wake early or cancel via UI/CLI/MCP. A new primary-chat request supersedes its sleeping predecessor and uses a fresh provider session. Pausing/removing an automation or revoking its creating credential invalidates its sleeping work.

## Delivery and notifications

Inbox publication creates one canonical unread notice. Reading or archiving the item updates that notice, so the bell and inbox do not maintain competing unread states. Agent-update push is separately opt-in in Notifications, using devices already enabled there. Push carries a generic preview and an exact inbox link. Reading, archiving, deleting or disabling agent push suppresses queued delivery. Ordinary DM/invitation push behavior remains on its existing paths.

## Shared operations

- Inbox: `inbox.publish`, `inbox.list`, `inbox.get`, `inbox.mark_read`, `inbox.archive`, `inbox.delete`.
- Automations: `automations.create`, `automations.list`, `automations.get`, `automations.update`, `automations.enable`, `automations.pause`, `automations.delete`, `automations.run_now`, `automations.runs`.
- Run controls: `runs.wake`, `runs.cancel`.

These are canonical UI/CLI/MCP operations. Account passwords and human-authored identity settings remain browser-owned. Read each schema, use a fresh idempotency key for each independent write, and provide exact human confirmation only where the operation requires it. Automation edits save paused; enabling the new revision is a separate reviewed action.

## References

Adaptation research: [Wayfinder automation study](roadmaps/09-automations-and-inbox.md).

Provider lifecycle: [Agents API sessions](https://developers.openai.com/api/docs/guides/agents-api/sessions), [function tools](https://developers.openai.com/api/docs/guides/agents-api/tools/functions). The configured `environment:none`, managed session flow, service-origin MCP, and existing model are preserved.
