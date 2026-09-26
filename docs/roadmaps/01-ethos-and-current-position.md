# What New Drugs should stay, and what the MVP actually gives us

Planning study, September 25, 2026. The starting code is commit `c04a10c`, with the separate gradient-preview edit in the working tree. This is a product proposal, not a claim that the future capabilities below are already available.

## The promise worth building around

New Drugs should help a person find interesting people, participate in a social world, and make things happen with them. Sometimes that means meeting nearby. Sometimes it means a good conversation, a shared joke, a video call, a useful introduction, or having someone to do a small project with.

The combination is unusual: a human social network with a capable agent, familiar direct controls, and no profit taken from the person's AI usage. The agent reduces the work around social life. The people supply the identity, taste, relationships and reasons to care.

That leaves room for a much richer product than the current MVP. It also gives us a way to reject features that would make the site larger while weakening its point.

## Explicit commitments from your instructions

| Commitment | Consequence for a roadmap |
| --- | --- |
| “New Drugs,” made in New England, a social experiment that takes no profit | Keep the human identity and local starting point. Financial design must distinguish actual costs, subsidies and donations. Do not quietly introduce a platform margin. |
| A cross between Twitter and Bumble BFF | Both public expression and forming connections matter. Do not reduce the site to a booking form or a swipe queue. |
| Human-authored profile text and photos | Agents can open profile editing and read permitted profiles. They cannot manufacture a person's social identity. |
| A capable agent plus full CLI/MCP orchestration | New capabilities need a shared operating contract. External agents should use their own reasoning without paying New Drugs for a redundant hosted model. |
| People must be able to use the actual UI | Invites, messages, posts and future plans must work without asking a model. Running out of AI credit must not make the underlying social app unusable. |
| Chat is the usual home; task UIs appear when useful | Grow typed, useful panels and cards. Preserve the conversation and navigation state. A new capability does not automatically deserve permanent navigation furniture. |
| Mobile is primary | Test the complete flow on a phone, including keyboard, dictation, notifications, uploads, deep links, loading and returning to the feed. |
| Real location queries using coarse shared points | Local discovery is approximate. Do not add live person pins, movement histories or precision claims to improve a demo. |
| Confirm serious agent actions, not everything | Keep requested DMs direct. Invitations, publication, deletion and other commitments need exact authority. A manual click can itself be the authorization. |
| Individual operations, with grouped human review | Compose multiple independently authorized actions. Do not transplant Wayfinder's bulk mutation APIs. |
| The agent's outgoing writing should sound like the user | Use their actual words/style, preserve intent, and do not invent feelings or promises. Human-supplied exact text remains exact. |
| No composed em dashes | This applies to agent replies and content it writes on the person's behalf. |

The current visual decisions are settled constraints for this study: Noto fonts, Phosphor icons, CSS variables, the radial composition, black agent bubbles, compact blue user bubbles, the flat black mic, and the blue dimensional page icon. These roadmaps are not a pretext for another visual redesign.

## Guardrails I recommend, rather than rules you explicitly dictated

These are my interpretation of how to protect the product as it grows. They should be accepted or changed deliberately.

**Do not sell access to people.** Paid reach, boosted profiles, priority invitations and preferential recommendations would create a new incentive system even if the proceeds only covered costs. I would fund shared costs through a visible operating budget and voluntary support before considering attention-based funding.

**Do not manufacture activity.** No fake local profiles, invented attendees, ghost-written personality feeds or automatic engagement comments to make an empty place look busy. A small honest community can be useful. Simulated social proof would damage the reason to trust it.

**Keep recommendation separate from consent.** A plausible match is not permission to contact someone, add them to a group, reveal their plans or commit their time. A profile interest is evidence of that interest, not consent to every related event.

**Let the app be funny and strange.** The name, your first post and your design corrections point toward a human social space, not a clinical friendship product. Useful logistics can coexist with jokes, experiments, niche interests and aimless conversation. We do not need a “wellness journey” around a person asking someone to get coffee.

**Make absence ordinary.** There should be no relationship streak to maintain, guilt about unanswered suggestions, or public penalty for declining a plan. The app should be comfortable to leave and useful to return to.

**Offer control over discovery.** Nearby and All should remain available. Search, chronological browsing and agent-selected lists are different ways to explore, not a single mandatory recommendation feed.

**Make exit practical.** Account recovery, export, deletion, disconnected devices and revocable agents are part of a person having control. They are particularly important if the site becomes the place their friendships and plans live.

**Preserve privacy without making promises the design cannot keep.** A coarse area is not anonymity. Public posts can still reveal routines, and an exact meeting venue can be deliberately shared with a group. Those are different disclosures and need different controls.

## The MVP's useful assets

The following are implemented in the current code, rather than speculative prerequisites:

- Human profiles with square photos, ordering, preview and approximate area selection.
- Public 280-character posts, likes, replies, threads and exact links.
- Invitations and accepted-connection DMs, plus blocking and basic reporting submission.
- Direct People, Posts, Messages, profile, storage and settings surfaces.
- A hosted agent with durable runs, real web search, file reading, consequential-action review, resumable human UI steps, provider usage accounting and live UI updates.
- A shared operation catalog used by browser actions, CLI and MCP.
- Persisted semantic vectors for public profiles, posts and replies, combined with lexical matching, strict filters and canonical authorization checks.
- Agent-selected post feeds whose ordered IDs survive in a return link.
- Navigation ancestors kept mounted so Back preserves scroll, loaded posts and drafts.
- PWA install metadata, a separate admin frontend, starter-credit controls, production Stripe configuration and an installed CLI with update/uninstall support.

That is enough to run a real small-community pilot. We do not need to invent a new architecture before learning whether people find each other interesting.

## Important distinctions the next features must respect

| Concept | What it means | What it must not silently imply |
| --- | --- | --- |
| Discoverable profile | Other users can find the person's permitted profile | Permission for mass outreach or access to private conversations |
| Follow, if introduced | I want to see someone's public posts | They know me, accept my DMs, or want to meet |
| Accepted connection | Both sides have the app's current contact relationship | A close friendship or agreement to future plans |
| Plan RSVP | A person has given an answer about a particular plan | Friendship with every attendee or consent to unrelated DMs |
| Circle membership | Access to a particular shared space | A public member directory, public attendance, or perpetual access after leaving |
| Nearby person | Their shared area center satisfies the filter | Their live physical position or an exact travel time |
| Nearby post | The post has a qualifying area tag | The author's current location |
| Selected-post list | An ordered view over currently authorized records | Permanent access to a deleted or newly private record |
| Private memory | Explicitly retained material for one person's agent | A public personality dossier or silent indexing of their DMs |
| Starter pool | An operator-controlled credit allowance | Cash deposited with a provider, or proof that each grant represents a unique person |

Following may be worthwhile for the Twitter side of the app. It should not replace the invitation model merely because another social network uses mutual follows to define friends.

## Gaps that change which roadmap is sensible

### Account continuity and leaving

The account routes currently register, sign in and sign out. Recovery, account-wide export and account deletion were not found in the catalog/routes. A user who forgets their password can therefore lose access to their social context and prepaid credit. This becomes more serious as plans and groups accumulate. See [account routes](../../server/app.ts) and [canonical catalog](../../shared/catalog.ts).

The small next step is a deliberate recovery model, not a demand for long passwords or a new identity-verification bureaucracy. Optional recovery methods, recovery codes, passkeys and session management deserve evaluation together.

### Profile audience and relationship lifecycle

The code needs a clearer product meaning for “private.” `people.get` requires another person's discoverability, while connection reads can return participant profiles. Discovery and an existing contact's visibility are therefore not the same rule today. Decide what an inviter, invitee and accepted connection should be able to see, and make the profile view, photos and agent reads agree. This is a policy/flow review, not a conclusion that every difference is an unauthorized disclosure.

Accepted connections also lack a normal disconnect operation in the current catalog. Blocking exists, but ending contact, keeping one's own history and reopening contact by consent deserve a deliberate lifecycle before adding groups. See [profile and connection reads](../../server/operations.ts).

### Reporting operations

`people.report` records an unreviewed report. The current admin UI handles the starter pool, not report triage, case history, appeals or moderation actions. A report button is not a staffed response process. The first growth phase needs someone accountable and a usable case queue. See [report operation](../../server/operations.ts) and [admin frontend](../../admin/main.tsx).

### Notification delivery

Notifications and unread state exist while the app is open. Push subscriptions, email delivery preferences, quiet hours and external delivery receipts are separate work. Plans and group conversations will perform badly if nobody learns that something changed. See [notification projection](../../server/notifications.ts) and [live state](../../server/liveState.ts).

### The starter-credit boundary

`createGuest` calls `grantStarter` before account registration. The shared pool correctly limits total grants, but multiple fresh guest identities can consume it. Before a wider invitation wave, decide when a person earns the grant and how to discourage trivial repeat claims without collecting excessive identity data. Do not treat a cookie as a unique human. See [guest creation](../../server/auth.ts) and [starter accounting](../../server/starterPool.ts).

### Search limits

The current public index is capped at 10,000 documents per stage. Feedback and retrieval snapshots are temporary. Named saved searches, durable collections, group-only corpora and private memory are not implemented. A 100-query synthetic evaluation is useful development evidence but not evidence that real people are well matched. See [search implementation](../semantic-search-implementation.md).

### Geocoding and geographic meaning

The code uses Photon's public demo. Photon permits reasonable project use, supports search-as-you-type, and does not promise availability. The app should cache appropriate queries, retain a usable fallback and have an explicit provider-capacity plan before growth. The source operation also returns attribution that the current picker does not render. See [location implementation](../../server/locations.ts), [picker](../../src/LocationPicker.tsx), and [Photon's published policy](https://github.com/komoot/photon#demo-server).

Ten-mile-scale area centers cannot establish that two people are a ten-minute walk apart. If walking-distance coordination matters, let people choose a public meeting anchor rather than silently restoring precise home location.

### Operating proof

The repository contains functional tests and deployment health checks. Those do not establish production backup restoration, notification deliverability, moderation response time, high-load behavior or successful payment/refund settlement. The roadmap should add evidence appropriate to each feature. “Not found in the repository” is not proof that an external service or process does not exist.

## How to judge a proposed feature

A strong feature has a specific human outcome, a credible first cohort, a complete manual path, an agent capability over the same rules, a funding explanation, and a way to stop if it is not useful.

For example, “make a small tennis plan with three interested people” is a useful hypothesis. “Add autonomous social intelligence” is not yet a feature. It becomes concrete only when we specify what the person sees, who is contacted, what can be changed, how consent is recorded, what the action costs, and how it can be cancelled.

The next documents explore several paths under these constraints. They are options, not a commitment to build the union of them.
