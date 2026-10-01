# Build sequence from v0.38.1

Companion to [the current direction](10-v0.38.1-direction.md). This is a proposed implementation order, not a permission to release it. Names of new operations and records below are provisional. Current `shared/catalog.ts` and production contracts remain authoritative until each slice is built.

## First product slice: People through public posts

### The interaction

Keep the current Friends panel and its search control. With no query, Nearby, All and Circle browse as they do today. With a meaningful query, return people whose own public profile, post or reply matches. Show a small exact source beneath the usual person card, with a link into that post or reply. Returning from the source preserves the People result position, query and scope. Friend, Hide and profile navigation retain their current canonical styles and actions.

One person appears once per page even if they wrote several matching posts. Show at most two source excerpts on the card. A matched post is evidence of what the author said at that moment, not a new profile tag, promise of availability, or claim of compatibility. Result order can use relevance and fresh source evidence, but no user-facing percentage or inferred trait is created.

### Contract and retrieval

1. Specify a shared read contract, tentatively `people.discover`, with `query`, Nearby/All/Circle scope, coarse area and bounded pagination. Keep the existing `people.search` contract compatible unless a deliberate migration is warranted.
2. Search the existing public profile, post and reply vectors plus lexical indexes. Constrain the vector candidate work before Mongo hydration; group candidates by author ID and bound unique-author expansion. Do not fetch all posts for each person or walk friend-of-friend edges at request time.
3. Apply current account visibility, block, hide, suspension, post moderation/deletion and area rules in the database. Circle uses its maintained pair index, then verifies current authorization. A stale Qdrant hit cannot authorize a card.
4. Return a typed person record plus exact source IDs, excerpts and links. The server rechecks source ownership and visibility when the card opens. Preserve post/reply context through the existing mounted-navigation behavior.
5. Make the same operation available to the hosted Agent, CLI and MCP. The Agent can select a few results and open the normal Friends view; it does not need another results UI or a generated paragraph about each person.

### Proof before a release

- A human-written post that is relevant to a query can surface its discoverable author, with that exact post linked on the People card.
- Profile-only results still work. Nearby does not silently become All; Circle does not include someone without a current permitted mutual path.
- Hidden, blocked, suspended, deleted and moderated sources disappear under current rules, including after a result was cached or an ordered selection was saved.
- Multiple matching sources do not duplicate a person. Bounded candidate/author work is shown in an explicit workload, following [SCALING_AUDIT.md](../SCALING_AUDIT.md).
- Mobile cards, source opening/Back, Friend/Hide and query changes use existing spacing, variables and controls. A real dev pass covers both an ordinary search and an empty result.

This slice can reach cloud dev incrementally. Production requires a fresh explicit founder request under the [operating guide](../OPERATING_GUIDE.md).

## Second slice: a native Agent selection

The Agent currently opens an ordered `post_list`. Generalize that pattern only as far as a real task needs: an ordered selection of current people, posts or live Talks, each with its exact source and a native card. Keep the source panel mounted so a person can inspect a post, return, refine and still find their place. A selection link can reopen the view; it is a current, owner-scoped projection over record IDs, not a permanent people bookmark.

The Agent's message introduces the selection briefly and lets the cards carry the content. Follow-up refinements should adjust actual records and show what changed. CLI/MCP can request the same result shape. At every read or open, reauthorize the ID and any source evidence. A blocked person, deleted post or ended Talk cannot be resurrected by an old selection.

In parallel, compare the current Luna path with an opt-in stronger model for a few hard, source-backed tasks. Keep model/spec identity in the run, enforce a visible spending bound and settle actual usage. Fix the hosted instruction that still recommends an external pair.video link for a call the app now handles natively. Separate this quality work from discovery correctness: a stronger model does not repair an unauthorized search result.

## Third slice: an upcoming Talk

Add a host-authored announcement that points at one future Talk. It has a title, optional description, intended start time, stable link and state such as upcoming, live, ended or cancelled. A host can edit or cancel before starting. Starting binds it to the existing LiveKit-backed Talk instead of creating a second room type. A viewer can open the announcement from Posts, choose a reminder and later join the live room. Public post links shown in a Talk must be reauthorized for each viewer.

Keep the existing Talk speaker/listener/request controls and the required human-written title. Avoid recording, tags, automatic Log creation or a group-chat history. Notifications should respect opt-in delivery and avoid duplicate reminders. The state transition must work across refresh, late joins, host disconnection and duplicate start requests.

Before growing this surface, verify production two-person media, phone layout, permissions, ringing/request tones and concurrent-room behavior described as open in the [calling reference](../communications/PAIR_VIDEO_REFERENCE.md). This is a technical dependency for a credible scheduled Talk, not a request to stress the shared production host.

## Fourth slice: introductions through Circle

This is later because the founder accepted the current Circle feature as complete for now. The possible next interaction is a request to **one named mutual friend** for an introduction. The mutual can decline silently or forward the sender's human-written note. The prospective recipient can accept, decline or ignore; only the normal accepted one-to-one connection opens Messages. No group chat or automatic friendship is created.

Treat this as a three-person consent state machine, not as a shortcut from `mutualCount` to a DM. Check both accepted friend edges against current records at each transition, along with hides, blocks, suspension and credential authority. The materialized Circle index can be delayed. Revoke pending handoffs when the required relationship ends. Make the request, forwarding, withdrawal and recipient response individually reviewable and idempotent through the shared operation layer. The UI should tell each person only what they are authorized to know.

## Parallel product-quality lane

- **Public/private boundary:** website previews are public by link even while unpublished. The earlier Log exposure was removed and its URL revoked; the founder stopped the site experiment. Before reopening it, design explicit public-content selection, preview revocation and source provenance at the operation layer. Private Log, chat or uploads should not become public because an Agent could read them.
- **Normal mobile paths:** verify the shipped invitation, DM, video call, Talk and Log paths on a physical phone and fix concrete failures. Keep the app's canonical CSS tokens and controls rather than redesigning adjacent panels.
- **Operational observation:** inspect worker queue age, search freshness, actual provider receipts and LiveKit joins alongside the database health check. The single host is an early deployment, not a proven concurrency envelope. Load work belongs on isolated infrastructure.

This lane accompanies product construction. It is not a claim that a week-old site has failed to acquire a community.

## After these slices

Human-authored place trails or short show-and-tell formats could make the public internet more specific to a community. A small plan/RSVP object can be revisited if the founder chooses that direction, but the prior plans-first sequence was declined. Group posting is a separate audience/membership design, without group chat. Agent-to-agent coordination needs explicit human review before it can act socially. Portable exports and independent clients become more important as people rely on the service.

These are proposals to select from, not an automatic queue. Each new object should have one complete manual flow, matching agent/CLI authority where useful, explicit privacy rules, source-backed links, a bounded workload and a clear rollback or stop path.
