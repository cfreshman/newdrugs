# Group posting without group chat

| Field | Value |
| --- | --- |
| Author | Codex |
| Status | **Unconfirmed agent proposal** |
| Founder approval | **None** |
| Implementation authorization | **None** |
| Basis | New Drugs v0.38.1, October 1, 2026 |

## Verified starting point

Posts and replies are public records with photo and link attachments, author context, search and direct controls. Friends contains accepted one-to-one connections and a Circle filter for people with mutual friends. DMs are one-to-one invitations and conversations. Pangaea has a read-only reference implementation of group membership and posting rules, but New Drugs has not imported its group domain.

## Founder decisions to preserve

The founder said group posting might be meaningful **later**, and explicitly rejected group chats in Messages. Circle is a mutual-friends filter, not a group. This document is a long-horizon fork, not a request to build groups now or an attempt to revive the old circles-first roadmap.

## Codex hypothesis

Some people may want a small, human-authored Post audience around a shared subject or place. A group could own a feed of member Posts while ordinary profiles and one-to-one Messages stay intact. This might let a community develop a recognizable voice without making its members participate in a permanent chat.

The critical product decision is audience. At least two coherent models exist:

- **Public reading, controlled posting:** anyone may read; approved members may post. New members encounter public history.
- **Member-only reading and posting:** only current members may read. The founder must decide whether joining grants access to older history and what a departing member retains.

Do not ship a vague “private group” toggle that changes these rules after people have written under one expectation. The audience model should be chosen and explained before implementation.

## If the founder later selects it

1. Choose one audience model and one membership path. Define the owner/host's powers, member removal, leaving, blocks, invitations and visible history in plain product language.
2. Extend the existing Post composer and cards with an explicit group audience. The human author reviews where a post will appear. Do not silently cross-post it to their public profile or an external site.
3. Add indexed member/audience predicates to list, exact post reads, search, notification fanout, media access, CLI/MCP and Agent operations. Search indexes cannot authorize a group-only post; canonical membership is rechecked on every result.
4. Provide minimal host moderation, a participant report route and deletion/leave behavior before inviting more than the first small group. There is no group DM or group-call entitlement merely because a posting group exists.
5. Verify with multiple devices and membership changes, including a blocked author, a removed member following an old link and a new member opening a pre-join post.

## What would make this a poor choice

A group feed could divide already thin public conversation or require a host to do more work than members get back. A member-only feed creates a substantial privacy and moderation obligation. If people mainly need a human tag or a public Talk, the group domain is heavier than the problem. That judgment belongs to the founder after seeing a concrete group use, not to this Codex proposal.
