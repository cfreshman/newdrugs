# A public post as a live Talk anchor

| Field | Value |
| --- | --- |
| Author | Codex |
| Status | **Unconfirmed agent proposal** |
| Founder approval | **None** |
| Implementation authorization | **None** |
| Basis | New Drugs v0.38.1, October 1, 2026 |

## Verified starting point

Posts already carry human-written text, photos, links and replies with exact shareable destinations. Talk already provides public live voice rooms under Posts, with a required title, optional description, speaker requests and a compact panel beneath whichever mode is open. An attendee can browse the app during a Talk. The current [Talk source](../../../server/spaces.ts) and [UI](../../../src/SpacesPanel.tsx) do not attach a post to a room.

## Founder decisions to preserve

Talk opens live and joins its host immediately. This proposal does not schedule a room. The compact Talk row is intentionally small and should keep its current counts and profile pictures. There is no group chat, recording, auto-generated title, automatic Log entry or resumed personal-site work. Screen sharing remains a separate deferred note.

## Codex hypothesis

A host sometimes wants to talk about one specific public post. A room could have **one optional, host-chosen post anchor** while it is live. The expanded Talk panel shows a compact source card that opens the real post. A person reading that post can follow a live-room link if the host explicitly attached it. The post author does not become a host or endorse the Talk merely because their post was chosen.

This would give Posts and Talk a deliberate handoff within the existing modes. The same idea could later support a person moving from a Talk to a one-to-one invitation through the existing profile. Each step remains their own action.

## If the founder selects it

1. Add a revisioned `postId` reference to a live Talk. Only its host can set, replace or clear that one reference. The operation uses current post visibility rules and an exact post ID; it does not copy post text into Talk data or the search index.
2. Resolve the post separately for each viewer whenever Talk is read. If it was deleted, moderated, blocked or otherwise unavailable, show no source card for that viewer. Keep the room usable when the post disappears.
3. Put the source only in expanded Talk. Keep the compact dock and Talk list/search focused on live room identity and people. Follow the post link through normal navigation and return to the still-open Talk panel.
4. Expose the same individual operation through CLI/MCP and the hosted Agent, with exact authorization and idempotency. Do not make posting or opening a Talk depend on an Agent.
5. Validate on desktop and phone with two accounts, including a post that becomes inaccessible mid-room and a room that ends while a post is open.

The existing self-hosted LiveKit room carries media. The post reference belongs in New Drugs' authorized room state, not in an untrusted media packet. [LiveKit's room model](https://docs.livekit.io/intro/basics/rooms-participants-tracks/rooms/) supports the live session; it does not decide New Drugs' post audience.

## What would make this a poor choice

If people rarely want a post to be the subject of a live conversation, a source card adds clutter. If author/audience permissions make the post unavailable to most listeners, the room feels inconsistent. The smallest useful version is one link in an expanded panel; a feed inside Talk or persistent room transcript would be a different product and needs its own decision.
