# Agent utilities

The user approved utilities 1–6. Utilities can be agent/CLI/MCP-only; add UI only when it makes sense. They explicitly declined event extraction/web lookup, post preview, schedule preview, spending breakdown and action preflight. Extra storage work was not requested. The agent handles its own web research.

## Current operations

| Capability | Contract |
| --- | --- |
| Replies addressed to you | `posts.incoming_replies`: direct replies from others to your posts/replies, with parent context, exact links, pagination and optional `since`. Also exposed as Replies to you on your profile. |
| Person context | `people.context`: authorized profile, exact relationship, recent public posts/replies and conversation links. Private former-contact profiles remain null; existing conversation history permissions are unchanged. |
| Catch-up since a date | `activity.since`: received invitations, current acceptance/decline responses to your outgoing invitations, received DMs, and likes/replies to your posts. Filter by kinds, paginate with a fixed `until` boundary. |
| Thread updates | `posts.thread_updates`: replies from others in public threads where you have a current visible post/reply, including follow-ups addressed to someone else. |
| Last message from them | `connections.list` with `lastMessageFrom:other` (or `me`/`any`). Reads the canonical latest DM before filtering/pagination. Invitation notes are not DMs; this does not imply a reply is owed. |
| Resolve dates and times | `time.resolve`: explicit timezone plus local date/time, relative calendar dates, offsets and weekdays. |
| Convert/current time | `time.convert`: an exact timestamp or server time in supplied timezones, with optional elapsed-minute arithmetic. |
| Availability overlap | `time.overlap`: merge and intersect explicitly supplied windows, returning UTC intervals and each participant's local times. No calendar access. |
| Approximate meeting areas | `locations.meeting_area`: balanced grid-center candidates for the caller and selected visible people. No web, venue or event search. |

All are read operations. They do not send messages, create events, change profiles, mark notifications read, or start another model. Hosted agents, CLI and MCP share the same schemas, permissions and links. Background agents require `accountActivity` for person context, catch-up and human conversation reads. Public-thread, time and coarse-location helpers retain their existing public-data scopes.

## Boundaries

- Catch-up is based on current source records, not an immutable audit. Removed, rescinded, blocked and moderated items are omitted. Snippets are capped at 300 characters and explicitly flag truncation. Private AI chat and Agent inbox are not part of social catch-up. Its cursor binds the owner, filters and ending time.
- Direct incoming replies and participated-thread updates are different queries. Neither pretends to know which posts were read. Deleted parent posts remain safe stubs where appropriate.
- A person context lookup does not expose DM history. It reuses existing profile, relationship and public-post reads; an inaccessible profile cannot be revealed through the bundle.
- Timezones must be explicit. The time functions use `@js-temporal/polyfill` 0.5.1. Missing/repeated DST wall times are rejected by default; earlier/later disambiguation must be deliberate. Resolution returns the reference time and flags shifted local times. Overlap operates only on supplied windows and does not infer availability.
- Meeting calculations re-derive coordinates from canonical H3 coarse cells, never raw stored/device coordinates. Candidate search balances the maximum straight-line area distance, then total distance; it does not calculate driving times or guarantee suitable venues. Dateline handling uses spherical geometry. Candidates may need `locations.resolve` for a cached/human-readable label, followed by the agent's own web search to check real places and accessibility. Do not link these candidates to the profile location editor or change anyone's saved location.
- Curated post cards should be the user's first presentation of their contents. Introduce and link a selection without repeating the posts in chat.

## Administration

The separate admin frontend has a Users tab. Operator-only `users.list` uses the same read as that page: registered accounts in the current stage, safe account metadata, balances, literal name/username search and cursor pagination. Guests/internal test accounts are omitted; private messages, profile prose, credentials and claim fingerprints are not returned. This is not exposed through the social operation catalog.

## Sources and validation

Reference behavior was inspected in Wayfinder's gateway authorization/inbox cores and Pangaea's post/thread implementation. Date/time semantics follow the [Temporal ZonedDateTime documentation](https://tc39.es/proposal-temporal/docs/zoneddatetime.html) and the [polyfill's usage documentation](https://github.com/js-temporal/temporal-polyfill).

Regression coverage is in `tests/agentUtilities.test.ts`, `tests/timeUtilities.test.ts`, `tests/incomingReplies.test.ts`, `tests/adminUsers.test.ts` and related UI tests. It covers owner/scoped access, blocks, missing/private profiles, moderated messages, filtered paging, activity source isolation, DST gaps/folds, overlap, fractional UTC offsets, coarse coordinates and the dateline. Database tests use only `newdrugs_test`.
