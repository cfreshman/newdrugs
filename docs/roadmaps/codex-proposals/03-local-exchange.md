# Local exchanges and human trails

| Field | Value |
| --- | --- |
| Author | Codex |
| Status | **Unconfirmed agent proposal** |
| Founder approval | **None** |
| Implementation authorization | **None** |
| Basis | New Drugs v0.38.1, October 1, 2026 |

## Verified starting point

Posts can carry text, photos and links, and public search can use their human-written content and an optional coarse area. People can reply, share and move into one-to-one invitations. A Post has no explicit state for a request that has been met or an offer that has ended. The app does not store a person's precise live position.

## Founder decisions to preserve

The earlier bookmarks-to-plans-to-circles roadmap was declined. No event scheduler, RSVP flow or group chat follows from this proposal. Profile text stays human-authored, Nearby remains a coarse filter, and All people/posts remain available. The Agent should not volunteer someone else's labor or contact a person because its model thinks they would help.

## Codex hypothesis

A public Post could carry a small, honest **open / fulfilled / closed** state when its author is offering or asking for something. Examples might be lending a tool, seeking a collaborator for an afternoon or asking a practical local question. The author writes the entire content; the state only helps a reader know whether responding is still useful. This is a possible answer to a stale-post problem, not a general marketplace.

A related but separate direction is a **human trail**: someone chooses a short sequence of public places or links with their own notes, such as a walk, a small art route or a collection of locally useful stops. Others can read it or share it with a friend. A trail describes deliberately public anchors, not the author's actual movements. The [earlier experiment note](../07-longer-horizon-experiments.md) sketches this possibility without approving it.

## If the founder selects the post-status idea

1. Start with one ordinary Post and an optional author-set state. Leave most Posts without a status. Do not infer request/offer intent from text or introduce automatic tags.
2. Let the author change or close the state, with an exact revision and a readable history on an open Post. Search and selected-post views should treat a closed post as readable history but not an active request.
3. Keep replies and one-to-one Messages under their existing rules. Marking a request open grants nobody permission to DM or invite on the author's behalf.
4. Add an explicit expiry only if stale open requests become a real problem. Expiry removes the item from current-request browsing while keeping its canonical Post and conversation intact.
5. Check spam, reports, blocks, unavailable authors and whether people feel pressured to answer. No payment, escrow, ranking by “helpfulness” or inferred reputation in the first slice.

If the founder instead chooses trails, write a separate audience and place-data contract before code. It may be possible to start with an ordered collection of existing human Posts/links rather than a new map system. Any venue hours, accessibility facts or prices the Agent supplies need current external sources and a clear “unknown” when not verified.

## What would make this a poor choice

If ordinary replies already handle short-lived asks, state controls add ceremony without value. If requests become a directory of unpaid obligations, the social character of Posts suffers. A trail can become stale or touristy without human authors who care about a place. Both formats are options to discuss, not a default feed redesign.
