# Capability atlas

This is the broader possibility space. It is not a prioritized promise to build every row. “Soon” means a plausible next slice or foundation item; “Test” means validate a human need first; “Later” needs another capability or evidence; “Fork” changes the product's obligations substantially.

Existing likes, replies, DMs, profile uploads, approximate-area search, selected-post feeds, CLI/MCP, PWA metadata and billing are not counted as new features below.

## Expression and discovery

| Possibility | The concrete benefit | Smallest useful form | Placement |
| --- | --- | --- | --- |
| Private bookmarks | Come back to something without publicly liking it | Save/remove a post and a Saved view | Soon, A |
| Following | Read a person's public work without requesting a DM connection | Directed follow plus chronological Following feed | Test, A |
| Muting | Reduce unwanted content without escalating to a block | Person/topic/circle mute with an inspectable list | Soon, A/C |
| Post corrections | Fix a mistake without destroying the conversation | Edit with a visible revision marker and defined reply/context behavior | Test, A |
| Human-chosen post photos | Share what happened or what someone is making | Existing downscaling/quota rules, explicit audience and accessible captions | Test, A/F |
| Mentions | Refer to the correct person and notify them appropriately | Exact handle resolution, permission-aware links, mute/rate limits | Test, A/C |
| Saved collections | Keep an agent-selected or hand-picked set of posts | Named owner-controlled list of IDs, current authorization on open | Soon, A |
| Saved searches | Revisit an intention without reconstructing its filters | Private query, scopes and an editable name; manual rerun first | Soon, A/D |
| Search across someone's public writing | Find an expressed interest absent from a short bio | Cite particular posts and separately authorize the person's profile | Test, A/B |
| Better search correction | Say what was useful or irrelevant | Explicit examples tied to a search, with optional deliberate persistence | Test, A/D |
| Feed recipes | Choose what a feed does | Inspectable sources, filters and order; finite set of supported options | Later, A/H |
| Human recommendations | Bring someone into a useful corner of the network | Opt-in collection or circle invitation; no hidden relationship disclosure | Test, A/C |
| Temporary public themes | Give a small community a reason to participate | A human-origin theme and its related posts, with a clear end | Test, A/F |
| Richer thread context | Understand a reply found through search | Parent/root context and exact return position, with unavailable states | Extend, A |
| A venue/plan map | Compare places where something could happen | Public anchors and verified place data | Later, B/G |
| A live people map | See individual movement or exact proximity | Conflicts with the current privacy approach | Fork, not recommended |

A saved collection is a snapshot of chosen records. A saved search is a recipe whose results may change. The UI and agent should not call both “saved results” without explaining that difference.

## Intentions and plans

| Possibility | The concrete benefit | Smallest useful form | Placement |
| --- | --- | --- | --- |
| Expiring intentions | Find someone interested in doing a thing soon | Activity, time window, audience and explicit expiry | Test, B |
| Plan draft | Turn a vague idea into something reviewable | A private draft with only the practical missing fields | Soon if B |
| Plan card | Keep the actual agreement in one place | Host, purpose, time, audience, location disclosure and state | Soon if B |
| Time poll | Choose among a few possibilities | Yes/no/maybe on bounded options; host resolves ties | Soon if B |
| RSVP | Know each person's answer | Interested/going/not going, with a way to change it | Soon if B |
| Clear cancellation | Avoid stranded participants and stale suggestions | Cancelled state, targeted delivery and old links showing the change | Required with plans |
| Venue/time change | Keep everyone aligned when facts change | Versioned material change and appropriate renewed acceptance | Required with plans |
| Capacity | Avoid inviting more people than the plan can support | A declared limit with atomic acceptance rules | Test, B |
| Waitlist | Handle genuine demand above capacity | Transparent queue, expiry and an explicit offer of a spot | Later, B |
| Bring a friend | Lower the social risk of joining | A controlled plus-one invitation with disclosure and capacity checks | Test, B/C |
| Repeat a plan | Make the second outing easier | Reuse a template while creating a new dated instance | Test, B/C |
| Recurrence | Support an established rhythm | Explicit series, per-instance changes and cancellation | Later, C |
| Calendar export | Put an agreed plan where someone already looks | A correct ICS file with timezone and update semantics | Soon after plans |
| Private free/busy | Find overlap without reading event titles | Optional provider access, short lookahead and revocation | Later, B/D |
| Travel-area intent | Meet around a chosen place without changing home area | Temporary search/plan anchor, distinct from profile location | Test, B/G |
| Remote session | Make a call or shared online activity easy to join | A real participant-provided link attached to the plan/conversation | Test, B/F |
| Ticket purchase/deposit | Handle money around attendance | Use existing provider links first; custody is a new product | Fork |

An expired intention should disappear from current matching even if a background cleanup job is late. Calendar lookup failure means availability is unknown, not that someone is free.

## Relationships and shared spaces

| Possibility | The concrete benefit | Smallest useful form | Placement |
| --- | --- | --- | --- |
| Better connection lifecycle | Stop contact without needing a permanent block | Explicit disconnect, archival-read policy and recipient-controlled reopening | Soon, trust foundation |
| Small private circle | Give a few people a shared place | Invitation, accepted membership, owner, leave and a conversation | Soon only if C |
| Group conversation | Coordinate without multiple disconnected DMs | Real membership checks, unread state and quiet controls | Required with circles |
| Co-hosting | Avoid a group depending on one person | One additional trusted host role with visible authority | Test, C |
| Group history policy | Avoid surprising disclosure to newcomers | Clear rules for past material before admitting new members | Required with circles |
| Pinned resources | Keep the practical facts available | A few links/posts with an accountable editor | Test, C/F |
| Public circle invitation | Let a private group choose to meet someone new | Human-written public description, request/invite path | Later, C |
| Group-specific moderation | Let hosts manage their space | Removal, bans, reports and a route to platform review | Required before group growth |
| Collaboration call | Find someone for a small creative project | Purpose, expected commitment and next session | Test, F |
| Offer/request status | Keep local help from becoming stale | Available/fulfilled/expired on an explicitly structured post | Test, E |
| Lending reminder | Remember a practical agreement | An owner-requested private reminder with a cancel action | Later, E/D |
| Reputation score | Reduce uncertainty by ranking people | High risk of unfair social incentives and misleading certainty | Fork, not recommended early |
| Friendship maintenance score | Tell people who they have neglected | Conflicts with the proposed agency and absence guardrails | Not recommended |

## A more useful agent

| Possibility | The concrete benefit | Smallest useful form | Placement |
| --- | --- | --- | --- |
| Typed activity comparison | Compare a few actual options | Source-linked cards with date, cost, place and unknowns | Test, B/G |
| A saved private preference | Stop repeating a constraint | Explicit save, source/date, edit/delete and expiry | Test, D |
| A private reminder | Follow through on a chosen intention | Owner-only delivery, visible schedule and cancellation | Test, D |
| A saved-search watch | Learn about something specific when it appears | Opt-in query, scope, expiry and notification ceiling | Later, A/D |
| Chosen conversation catch-up | Recover useful context | Summary of currently permitted records with source links | Test, C/D |
| Exact scheduled message | Send a message the user already specified | Recipient, exact text, time, visible outbox and reauthorization | Later, D |
| Delegated coordination | Save repetitive planning work | Narrow action/recipient/time/budget policy, receipts and stop | Later, B/D |
| Shared group agent | Help a circle operate its own space | Visible group authority and shared records only | Later, C |
| Private file retrieval | Find information in an owner's chosen files | Explicit opt-in indexing, separate access/cost/retention boundary | Later, D/H |
| Better voice input | Make mobile conversation more dependable | Compatibility testing first; paid transcription only with a clear cost model | Test across paths |
| Agent-to-agent negotiation | Coordinate across people's preferred tools | Delegated authority that never treats another agent's request as human consent | Later experiment |
| Automatic social posting | Keep the network looking active | Would manufacture activity and dilute authorship | Not recommended |

Every one of these needs a direct human management surface. A person must be able to see and stop a reminder, inspect memory, leave a circle or change a plan without having to persuade the model.

## Ownership, delivery and sustainability

| Possibility | The concrete benefit | Smallest useful form | Placement |
| --- | --- | --- | --- |
| Account recovery | Keep access to relationships and prepaid credit | A deliberate recoverable identity flow | Foundation |
| Session management | End access on an old/shared device | List and revoke sessions | Foundation |
| Account export | Keep one's own work portable | Documented export with explicit treatment of shared conversations | Foundation |
| Account deletion | Leave in a way that matches the promise | Owned-data cleanup, tombstones, file/index cleanup and retention disclosure | Foundation |
| Report status and case handling | Know a report reached someone | Separate operator queue and an honest user status | Foundation |
| Notification preferences | Hear about useful changes without being overwhelmed | Per-channel/context choices and quiet hours | Foundation for plans/circles |
| Web push | Reach an opted-in absent participant | Subscription lifecycle, service worker, generic private previews and exact return links | Test early |
| Optional email | A fallback channel or recovery method | Explicit purpose/consent, deliverability and unsubscribe rules | Test, not mandatory identity by default |
| Native mobile app | Improve a measured mobile limitation | Shared contracts and tested notification/voice/navigation behavior | Later, evidence-led |
| Durable off-host storage | Preserve files beyond one host failure | Authorized object storage with real deletion and restore behavior | Before capacity demands it |
| Operational budget view | Make no-profit operation understandable | Separate paid credit, starter allowances, donations and actual shared costs | Foundation/extend admin |
| Pay-it-forward support | Help fund someone else's first use | A funded allowance ledger with clear limits and refund policy | Later, after the current pool is sound |
| Shared stewardship | Avoid one person's availability determining everything | Defined operator roles, audit history and succession/recovery | Later, C/H |
| More specific agent scopes | Limit what an external agent may access | Public-read, private-read and selected write/resource scopes where justified | Test with real clients |
| Better CLI discovery | Reduce token/context waste for external agents | Compact discovery and input-focused schema output, with full definitions available | Incremental, H |
| Change subscriptions for clients | Keep external tools reactive without polling everything | Scoped cursors, reconnection semantics and explicit delivery limits | Later, H |
| Protocol bridges | Let chosen public material travel | Explicitly scoped public records and an honest deletion/portability model | Later strategic choice |

Web push does not require committing to a native app first. WebKit documents push for installed Home Screen web apps and user-gesture permission requests. The actual supported-device experience still needs testing. [Primary reference](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)

## Combinations that are worth trying, without committing to an entire platform

- A temporary “up for a walk” intention plus one plan card.
- A saved list of human posts plus a single opt-in weekly catch-up.
- A tiny private circle plus a reused Saturday plan.
- A collaboration invitation plus a remote call link and one agreed next step.
- An offer/request post plus an honest fulfilled state.
- A chosen public meeting anchor plus approximate-area search.

These are small enough to learn from. Each can be removed or changed without turning the whole site into a different product.
