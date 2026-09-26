# Complete flows, surfaces and operating rules

This document turns a few roadmap options into things a builder can actually implement. All new operation names below are illustrative proposals. The live catalog remains authoritative; these names are not currently callable.

## 1. A post becomes a small plan

A person sees a human post about tennis. They open it, read replies and ask their agent to help arrange a game. The agent reads that exact post and any relevant current public context. It proposes a private plan draft rather than publishing an event or claiming the post's author is hosting.

The PlanPanel fits the existing progressive surface model. It contains the activity, a time or a few time options, the audience, an optional deliberately shared place and a simple participation state. The person edits it directly if they prefer. Missing practical details should produce one useful question or control, not a long intake form.

Before publication or invitations, the host review shows the actual activity, people, time, location disclosure and text. Each invitation remains an individual operation with its own receipt. Confirm all can group the human decision without making the underlying work one opaque bulk action.

Recipients see a real invitation and can accept, decline or inspect the plan. A plan RSVP is separate from an accepted DM connection. The agent cannot interpret a vote for a possible time as an unconditional promise to attend.

When something changes, the existing card updates from server state. A material change to time, audience or place may require renewed acceptance. Cancellation removes it from current discovery, leaves an understandable state at old links and notifies the affected participants through their chosen channel.

**Surfaces:** PlanCard, PlanPanel, TimePoll, RSVP controls, invitation review, normal post/thread links and notification destinations.

**Candidate operations:** `plans.draft`, `plans.get`, `plans.publish`, `plans.update`, `plans.cancel`, `plans.invite`, `plans.respond`, `plans.vote`, `plans.export_calendar`.

**Authority:** a private draft is reversible and does not contact anyone. Publication and invitations use exact review in the agent path. Manual Publish/Invite/RSVP controls are explicit human actions. An agent's commitment of the user to a plan should have a deliberate policy, rather than inheriting “all writes are automatic” or “confirm everything.”

**Completion evidence:** durable plan/response IDs, current revision, exact links and independently recorded invitation results. Opening the panel is not completion of the plan.

**Failure cases to include:** a blocked invitee, a full plan, simultaneous RSVPs, a stale time vote, a host cancellation while an agent is running, a changed venue after acceptance, duplicate network submission, a deleted source post and a daylight-saving transition.

## 2. “I'm up for something” without publishing a live location

The person explicitly creates a temporary intention: activity, a bounded time window, audience and approximate area or chosen public meeting anchor. The form can be tiny. It should be equally usable without AI.

The agent can search current compatible intentions and public posts. It must distinguish an explicit current intention from a general profile interest. Someone liking tennis is not evidence that they are free this afternoon.

An intention expires through its own clock check on every read. A delayed worker must not keep it visible as current. The person can end it early, edit it or turn it into a plan. “No matching intentions” does not mean nobody nearby is interested or available.

**Surfaces:** a small intention card, edit/end controls, scoped search results, a PlanPanel handoff.

**Candidate operations:** `intentions.create`, `intentions.search`, `intentions.update`, `intentions.end`.

**Boundary:** the intention's meeting/search area is distinct from the person's profile area and precise device location. No continuous tracking, arrival inference or automatic travel-history publishing is required.

**Failure cases:** an expired record still in a vector index, an edited audience, a blocked author, an empty local corpus, a location-provider outage and an agent confusing “interested someday” with “available now.”

## 3. A circle repeats something worthwhile

Start with a deliberately simple circle. A human creates its purpose, chooses its initial membership policy and invites particular people. Invitees can understand who is hosting, what they are joining and what history they will see before accepting.

A circle has a real shared space and a clear leave action. Its group messages, files, plans and search results follow the same membership rules. A co-host can keep a recurring activity running, but does not acquire access to members' unrelated DMs or private agent notes.

An agent can summarize permitted group context or prepare the next plan for its owner. A future group agent would have a visible group identity and bounded group authority. It is not simply one member's personal agent secretly reading everyone's records.

**Surfaces:** CirclePanel, members/invitations, one shared conversation or feed, plan cards, mute/leave controls and host moderation.

**Candidate operations:** `circles.create`, `circles.get`, `circles.invite`, `circles.respond`, `circles.leave`, `circles.remove_member`, `circle_messages.list`, `circle_messages.send`.

**Decisions before coding:** whether new members see old content, whether a former member can retain their own history, what blocking means in a shared group, who can invite, and what happens when the owner leaves.

The current DM helpers assume two people in important places. A group is not safely implemented by allowing a longer members array. The relevant source is [connection and message authorization](../../server/operations.ts).

**Failure cases:** removed member with an open tab, revoked external token, hidden membership leaking through search, a private attachment URL shared outside the group, blocked people attending the same public plan, ownership transfer and a report about a host.

## 4. A saved search becomes an optional watch

The person saves a search with its scope and filters. Initially they can reopen and rerun it manually. If they later ask to be notified, they choose an expiry and a reasonable frequency ceiling. The agent shows what it will monitor and how to stop it.

The watcher primarily reuses the saved query/vector and current authorized index. It should not spend on a long model conversation for every new post. A potentially useful result becomes an owner-only notification or collection, with actual source links and an explanation of why it may fit.

A watcher has no reason to open a panel over an unrelated draft. It waits for the person to follow its notification. It also has no authority to contact the author, join an event or publish a response.

**Surfaces:** SavedSearch editor, notification settings, result list, pause/delete controls and cost/activity history where relevant.

**Candidate operations:** `saved_searches.create`, `saved_searches.update`, `saved_searches.run`, `saved_searches.pause`, `saved_searches.delete`.

**Authority:** read-only by default. A separate user request is needed for a social action based on a result.

**Failure cases:** deleted/blocked content, stale availability, query changes during a scheduled run, a missed schedule, notification retries, exhausted platform budget and a cancelled watch with work already queued.

## 5. Memory that remains the person's property

The person explicitly asks to save a preference or note. A memory record has an owner, source, content, date, revision and optional expiry. A readable management panel makes it possible to inspect, correct, delete or switch off memory.

Public profile fields do not get rewritten from memory. Public matching does not gain access to it. Private DMs and files do not enter the memory index merely because the agent can currently read them. The product should make any broader collection mode a separate deliberate choice.

The Wayfinder reference is useful for ownership checks, access partitions, revision conflicts, expiry and an operator stop. Its organization/team sharing model and default preference are not automatically appropriate for a personal social app. See [memory core](../../../wayfinder/convex/agentMemory/core.ts), [contracts](../../../wayfinder/convex/agentMemory/contracts.ts) and [expiry](../../../wayfinder/convex/agentMemory/expiry.ts).

**Surfaces:** MemoryPanel, source links, edit/delete/expiry and an off control.

**Candidate operations:** `memory.save`, `memory.list`, `memory.search`, `memory.update`, `memory.delete`, `memory.settings`.

**Failure cases:** a preference being treated as fact about someone else, removed source access, stale embeddings, expiry during a run, cross-account UI restoration and deleted memory remaining in an assistant's future context.

## A small set of typed components

The current PostList is a good model for future UI power. It renders application records with actual controls, rather than model-produced HTML.

| Component | Authoritative inputs | Useful direct controls |
| --- | --- | --- |
| PeopleList | Authorized profile IDs and current projections | Open profile, invitation/status, block/report where appropriate |
| PostList | Ordered post IDs or a defined feed recipe | Open thread, like, reply, profile, save if implemented |
| ActivityOptions | Verified source URLs, dates, places, stated facts and unknowns | Open source, save, compare, start a plan |
| PlanCard / PlanPanel | Plan ID, revision, audience and current responses | Edit, invite, vote, RSVP, cancel, calendar export |
| CirclePanel | Circle ID and the viewer's current role | Conversation, members, plans, quiet controls, leave |
| SavedSearchPanel | Owner, query, constraints and watch policy | Run, edit, pause, delete |
| MemoryPanel | Owned records, source, revision and expiry | Inspect, correct, forget, disable |
| ReviewCard | Exact consequential action arguments and current authority | Confirm/reject, grouped review of individual actions |

The model can select a component and verified record IDs. The host controls data access, rendering, actions and completion. Arbitrary generated UI code is not necessary for this roadmap.

Keep the existing navigation behavior: one column on narrow screens, an adjacent panel when there is room, preserved state on Back, no surprise modal replacing the launcher, and no loss of chat/DM drafts. Most new components can use the same header/footer and content container.

## Shared domain rules before surface-specific shortcuts

A richer app needs a consistent audience model covering public records, an accepted connection, a circle, plan participants and owner-only records. Apply the same policy to normal reads, search, notifications, attached files, exports, cached projections and agent context.

A private group field in the UI is insufficient if a generic `posts.get`, file URL, semantic index or notification preview still exposes its contents. Conversely, a read that is no longer authorized should not be restored from an old vector or cached tool result as though it were current.

The existing public search hydration and block checks are a useful starting point. Do not copy their current “all posts are public” assumptions into a private group feature.

### The same feature through three clients

For every new user capability, check:

1. A person completes it manually in the app.
2. The hosted agent discovers the contract, reads current state, performs permitted work and handles any real human continuation.
3. An external CLI/MCP client can perform the corresponding permitted action with the same results and visibility.

Human profile authorship, authentication/credential creation and payment entry remain intentional human boundaries. “Parity” does not mean giving an agent a bypass around them.

### Authority for background work

A proposed scheduled job should record its owner, trigger, expiry, permitted reads/actions, target restrictions, budget and notification policy. Recheck current permissions at execution, not only at creation. A blocked person, removed group member, revoked token, changed plan or paused job changes what can happen.

For the first iteration, watchers and reminders should be private/read-only. Exact scheduled messages can carry the already specified text and recipient. Newly generated outward content is a different delegation decision and should not inherit authority from “remind me.”

Wayfinder's useful lesson is the separation between policy, current readiness, execution and receipts. Its CRM outreach workflows and broad business automation are not the social behavior to copy. See [readiness checks](../../../wayfinder/convex/automationPreconditions.ts) and [reminder muting](../../../wayfinder/convex/scheduling/reminderMutes.ts).

### Time and changing facts

Store explicit dates and IANA timezones. Resolve phrases such as “Saturday” in the relevant context before committing. Handle daylight saving, all-day events, changes to the chosen place and differing participant zones.

Availability queries can be incomplete. Wayfinder's external-calendar loader treats truncation as unknown instead of free, and checks that a calendar is still connected before using retained data. Those are directly useful principles for optional calendar coordination. [Source](../../../wayfinder/convex/scheduling/externalCalendarAvailability.ts)

### Notifications as a separate delivery system

The app already has notification records and in-app live updates. Off-app delivery needs subscriptions, preferences, deduplication, retries, channel failure, revocation and quiet hours. A cancelled plan should not send an old reminder because a queue was delayed.

Use a generic lock-screen preview by default when content is private. Do not quietly put a private venue, contact note or group membership into a notification body. The person should be able to mute a noisy circle without losing essential account access or being forced to block its members.

### Search growth should follow data and evaluation

Public profiles, posts and replies already have a shared retrieval layer. The next improvements should answer observed queries better, not accumulate techniques for their own sake.

Useful next evaluation cases include sarcasm/negation, old availability, vague interests, place-name ambiguity, slang, multilingual content, replies whose meaning depends on their parent, and filters that produce a thin corpus. Keep exact handles, dates, explicit geography and current access deterministic.

Introduce an evidence-based reranker only if it beats the current baseline on a held-out judgment set enough to justify cost/latency. Longer private documents or thread context may justify different representations later. A short profile and a 280-character post do not automatically need a large contextual retrieval pipeline.

Do not turn another person's public posts into a permanent inferred-interest field. Return the particular source as evidence, and let the person decide what that means.

## What scaling actually needs to prove

The source currently contains a 10,000-document public-index cap per stage, a four-run hosted worker limit, a 128-subscriber live-connection limit per process, and a 64 MB storage quota per account. These are concrete implementation limits, not a certified capacity for a particular number of users.

Before raising them, measure concurrent sessions, worker wait time, indexing delay, search latency, native-memory generations during rebuilds, total stored bytes and delivery failures. The current index is rebuilt from MongoDB when its generation changes; frequent writes at a larger corpus deserve a real benchmark.

In particular, a full indexing outbox should distinguish an operator capacity problem from ordinary short indexing lag. Do not tell users “recent changes are still being indexed” indefinitely when the actual limit requires an operator decision.

A full per-account storage quota is not an aggregate storage plan. At 1,000 accounts, 64 MB each permits over 60 GB of user files before replication/backups and database overhead. That arithmetic alone is enough to require a storage-capacity decision well before a small droplet could promise every account its full quota.

## Proof required for a vertical slice

| Case | What success looks like |
| --- | --- |
| A normal manual flow | The person can finish and inspect the resulting record without AI |
| A hosted-agent flow | Real result, exact link, correct authority and no fabricated completion |
| An external-agent flow | Same permission/result semantics, with no hosted AI charge |
| A retry or reconnect | One intended action and one receipt, not duplicated invitations/messages |
| A permission change mid-task | No new unauthorized read or effect after the relevant boundary |
| Tentative user wording | “I might be free” remains tentative; it does not become an RSVP or an invented promise |
| Untrusted content | A post, profile or event page cannot turn a read-only task into permission to send a message |
| Cancellation | Future work stops; already completed effects remain honestly reported |
| Back and background updates | Drafts, filters, loaded pages and reading position remain usable |
| Old links and deleted records | Current authorization and understandable unavailable/tombstone states |
| A release during pending work | Stale approvals fail clearly; committed actions remain recoverable |
| No hosted AI or no credit | Direct social controls still work |
| Provider/delivery outage | Honest pending/failure state and bounded recovery, not fake success |
| Leaving/deletion | The audience and retention rules work through storage, search and notifications |

The existing automated tests are an asset. These cases add the evidence required by richer social commitments; they are not a request to build a second implementation for every client.
