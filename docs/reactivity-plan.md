# Reactive New Drugs

The app must update when its data changes. A message, balance, approval, uploaded photo, invitation, or account switch should not depend on navigating away, sending another message, or periodically reloading the entire app.

This plan keeps the cloud MongoDB replica set and hosted Agents API. It transfers Wayfinder's observable behavior rather than claiming that replacing Convex with polling is equivalent.

## What the investigation found

- The browser polled `/bootstrap` every 750 ms during a run and every five seconds otherwise. That refetched private history and account data for every update and let overlapping refreshes overwrite newer state.
- The worker submitted input before subscribing, closed the provider stream every six seconds, and ignored all future deltas for an item that appeared in its reconciliation snapshot. Buffered `item.added` events could also replace existing text with an empty string.
- Draft persistence was conditional on another event arriving; a short trailing chunk could stay unflushed while the model called a tool.
- Completion events carried usage that the worker did not meter. List responses could still have missing usage when the run ended, and no later reconciliation existed. A direct retrieval of a completed turn returned usage for an account whose ledger had no charges.
- An initial animation implementation only affected the small status line. It did not smooth the live answer body. This was an implementation error, not a provider limitation.

## Behavior to preserve from Wayfinder

Read-only implementation references:

- `../wayfinder/src/components/agent/AgentProvider.tsx`: stable saved turns and one live bubble, with commentary separated from final-answer content.
- `../wayfinder/convex/agentRuntime/streamingDraft.ts`: serialized timed flushes, message boundaries, immediate commentary clear when an answer starts.
- `../wayfinder/src/components/agent/AgentScrollArea.tsx`: follow only an already-following reader during streaming; a one-shot scroll for submission/completion; preserve the bottom edge when the viewport shrinks.
- `../wayfinder/src/components/agent/CollapsibleAgentMessage.tsx`: measured long-message previews, expansion without jumping down, bottom-edge anchoring on collapse, and safe link focus.
- `../wayfinder/src/components/agent/teamMessagePlacementMotion.ts`: inert visual copies crossfade during geometric movement; actual message layout and accessibility stay present.
- Pangaea's `Profile.jsx` and `ProfilePreview.jsx`: a real public profile projection and scoped updates; content arrives without discarding the reader's current view.

Neither reference application is edited, run, or deployed as part of this work.

## Layer 1: provider events to durable run state

Implemented in the current working tree:

1. Create conversation-only hosted sessions with initial input and streaming creation. Empty creation is rejected for environment:none. For existing sessions, open and consume the event stream before submitting input with a stable idempotency key.
2. Read incoming events while saved history is reconciled. Only suppress buffered overlapping deltas for snapshot items; accept subsequent live deltas. Complete text replaces partial text authoritatively. An old item-added event cannot erase an existing partial item.
3. Keep commentary and final-answer content separate by item identity. Reasoning summaries are not displayed as thinking text.
4. Flush changed draft state through one serial queue every 125 ms, including during provider silence. Flush boundaries and completion immediately.
5. Maintain the stream across automatically executed function calls. Release worker ownership when human approval/input is needed. Human completion queues the same task again.
6. Use leases, renewal, cancellation checks, and four concurrent run slots. A failed stream reconnects against saved work; it must never resubmit a successful message with a new idempotency key.
7. Finish directly on a root turn's terminal event, rather than waiting for another worker poll.

Remaining hardening: persist enough item projection state to bridge a long provider outage without temporarily losing an uncompleted suffix; explicit cancellation/terminal arbitration; transport metrics and stream-gap alarms; a provider-conformance test for each supported event family. Provider streams cannot replay missed intermediate events, so recovery must use saved items rather than inventing text.

## Layer 2: committed data to the browser

Implemented foundation:

- A single MongoDB change stream per app process watches users, runs, messages, ledgers, sessions, connections, direct messages, blocks, posts and notifications.
- An authenticated `/api/events` SSE connection is scoped to a browser session and user. Database documents and credentials never become event payloads.
- Subscription begins before the initial read. Events arriving during the read mark the affected projection dirty; a subsequent read catches up.
- Each connection has an epoch and increasing sequence. A reconnect receives a fresh authoritative snapshot, not a promise to replay an arbitrary old event log.
- Project user, wallet, messages, and run independently. Read related values in a MongoDB snapshot transaction. Coalesce commit bursts and omit unchanged projections.
- A completed run invalidates messages, wallet, and active run together. The final message and its balance do not depend on two unrelated polls.
- SSE has explicit no-buffer/no-transform headers, keepalives, session revalidation, revocation handling, connection limits, and a slow-client byte limit. Shutdown closes connections and the shared database watcher.
- The client consumes ordered patches and rejects stale HTTP refreshes after a newer live patch. It reconnects and resnapshots after transport errors.

Remaining hardening: shared per-user projection reads for many tabs; strict backpressure with one coalesced pending projection; token-authenticated subscription contracts if CLI clients need subscriptions; account-switch generation isolation for all drafts, outboxes, file work, and native surfaces; explicit hidden-tab reconnect policy. Browser cancellation only closes the UI transport, never the hosted task.

## Layer 3: usage and wallet

Usage returned with completion is debited immediately in MongoDB; live state pushes the new wallet to the browser. Missing usage is pending, not free.

- Key each cumulative provider report by provider turn ID. Repeating the same report cannot add a second charge.
- Store the rate used for that task. Calculate the difference from the prior cumulative report, then apply only that difference to the wallet and ledger.
- Reduce the outstanding reserve as reported usage is charged. Finishing releases the rest without charging already-paid usage again.
- Re-read terminal turns for delayed/corrected usage with a bounded retry schedule. Downward corrections refund the difference; upward corrections apply once. Existing affected runs can be recovered by the same mechanism.
- Preserve the user-requested upward cent rounding on the gear label. Show the smaller underlying charges in billing activity.
- Do not guess cache-write counts or treat aggregate turn input tokens as a single model call's context length. Agents API turn usage is best-effort, may arrive late, and is not the final provider bill. Known reported categories can be charged at the stored rate; unknown additional costs remain operator-funded until supported evidence exists.

Remaining work: reconcile model-call trace exports against provider billing for exact cost attribution, expose pending usage clearly, add bounded run budgets enforced between tool/model steps where the hosted API permits them, and alert on missing reports or reconciliation failures. Never claim exact provider-bill parity while the available API omits charge categories.

## Layer 4: native social surfaces

The profile editor now stages human-chosen images, verifies uploaded bytes, strips image metadata, saves owned ready photo IDs, and previews with the public profile renderer. Real location choices use resolution-5 fixed grid points; precise device coordinates are snapped before network requests.

Expand subscriptions by domain rather than sending every social record through bootstrap:

| Surface | Subscription scope | Update behavior |
| --- | --- | --- |
| Profile | Selected person plus current actor's visibility | Refresh photos/text after save; remove access immediately after block/privacy changes |
| Nearby people | Coarse point, radius, filters, actor | Invalidate membership and approximate distances; preserve scroll and selection |
| Feed | Area/scope and actor | Queue a new-post indicator while reading; remove deleted/blocked records immediately |
| Post | Post ID and actor | Update exact record or show unavailable without returning to chat |
| Invitations | Current user's memberships | New invitation, accepted/declined state, readable counterpart profile |
| Direct messages | Accepted connection and both members' authorization | Append stable message IDs; follow only an already-following reader; revoke on block |
| Uploads | Current owner and selected staged IDs | Ready/failure events; never expose unchosen or private files |
| Review cards | Run ID, approval revision and per-action IDs | Replace stale review state; confirm/reject each action; grouped UI only |
| Admin pool | Separate owner session; shared pool | Budget, grants and remaining funds update across stages without mixing social/admin authority |

Social invalidation and owned notification projections are implemented for profiles, posts, invitations, messages and blocks. Feed refreshes offer an update control instead of moving a reader through new posts. Admin pool push updates and dedicated upload subscriptions remain follow-on work. Each needs a validated query contract, authorization predicate, pagination cursor tied to its filters, and a renderer that retains the existing chat context on return.

## Rendering and interaction rules

- Show only the gradient until initial chat/settings data is loaded.
- Keep stable message/run/item keys. Local pending messages reconcile by the same request ID. A failed refresh after an accepted send is not a failed send.
- Smooth received live text, not private reasoning. Do not let an older snapshot erase visible text. Final saved output bypasses all visual backlog and appears immediately.
- Respect reduced motion. Avoid animation queues that outlive their run, keep running after unmount, or move focus.
- Preserve the semantic sent message throughout the input-to-bubble transition. The visual duplicate contains two inert layers inside one moving object; no text scaling or duplicate accessibility nodes.
- Background wheel/touch gestures scroll chat. Modals, focused controls, native scrollers, horizontal gestures, pinch zoom and orb dragging keep ownership of their gestures.
- Desktop settings modals grow from the top-right control; mobile modals use normal centered layout. Back remains beside Close, and outside dismissal is pointer-down only.

## Verification and release gates

Current New Drugs tests cover progressive live text/final bypass, reduced motion, clone cleanup, input clearing before acceptance, long-message focus/scroll behavior, background wheel/touch routing, edge fade, keyboard/drag resize anchoring, real image byte verification/metadata removal/ownership, coarse geographic searches and blocking, cumulative/late/corrected usage, wallet SSE isolation/revocation, and subscribe-before-input with a synthetic hosted event stream.

Before calling the live path fixed, deploy **dev only**, verify real SSE through Nginx and the user's local Vite proxy, run one bounded synthetic hosted-agent turn, and verify ordered intermediate text, immediate final output, and one ledger charge. Use a separate test account; do not write the user's profile or send social messages. Test desktop/mobile modal geometry in a rendered browser because jsdom cannot establish pixel alignment. Leave the user's local server process running and do not bump the public version for a dev deployment.

Follow with reconnect during output, worker restart, same-account multitab, logout/login during a slow refresh, replayed webhooks, shared-pool changes, and social permission changes. Track first-delta latency, last-provider-event-to-browser latency, SSE reconnects, projection read frequency, dropped/unknown events, pending usage age, and duplicate-charge attempts without logging private content or tokens.

## Official protocol references

- [OpenAI session events and recovery](https://developers.openai.com/api/docs/guides/agents-api/sessions/events)
- [OpenAI usage availability and cost limitations](https://developers.openai.com/api/docs/guides/agents-api/observability)
- [MongoDB Node driver change streams](https://www.mongodb.com/docs/drivers/node/current/monitoring-and-logging/change-streams/)

Verified against the installed OpenAI and MongoDB driver sources and official documentation on September 25, 2026.
