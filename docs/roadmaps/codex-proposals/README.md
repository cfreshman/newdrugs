# Codex's unconfirmed roadmap drafts

| Field | Value |
| --- | --- |
| Author | Codex |
| Status | **Unconfirmed agent proposals** |
| Founder approval | **None for these proposals** |
| Implementation or deployment authorization | **None** |
| Baseline | New Drugs v0.38.1, October 1, 2026 |

The founder asked Codex to explore plans and roadmaps under Codex's identity. These documents are independent ideas for discussion. They are not the current product direction, a task queue, a decision record from the founder, or permission to change the app. Each proposal repeats its status so a direct link cannot lose that context. Direct later founder instructions, `AGENTS.md`, the current [handoff](../../HANDOFF.md) and actual source control implementation work.

The [September roadmap study](../README.md) is older option research. Its original plans-first sequence was declined. Two October v0.38.1 drafts that prematurely framed the week-old app as a traction problem and proposed new People search UI and scheduled Talk were withdrawn. They must not be recovered from Git history as approved work.

## Verified starting point

Production has Agent, Posts, Friends with Circle mutual context, private/shared Log, live public Talk, one-to-one DMs and video calls, semantic search, automations and Agent inbox, CLI/MCP, and personal website operations. The app is less than a week old. Current use cannot establish a retention failure. The original scaling-audit defects were repaired, but larger concurrent workloads are not proven. Read [the handoff](../../HANDOFF.md) for the exact operational state.

## Founder directions that limit these drafts

- Public profiles remain human-authored. Private Log and chat are not public website, post or discovery material by default.
- Circle is the mutual-friends filter and is done for now. Group chats are unwanted. Group posting was only a possible later direction.
- Talk is live. No upcoming/scheduled Talk plan was requested. Screen sharing is a separately deferred note.
- An app-wide search tab/dashboard is unnecessary. `search.query` already serves cross-category public search as an Agent/CLI/MCP tool. Posts, Friends, Talk, Log and Chat keep their appropriate local searches.
- The founder rejected the suggested post-derived People search UI, stronger-model roadmap, and mutual-friend introduction flow in this discussion. The personal-website experiment was stopped.
- The earlier bookmarks-to-plans-to-circles sequence was declined. Plans are not the default next feature. Do not interpret any option below as reversing that decision.

## Option map

No row is selected by the founder. Each file separates shipped facts, founder constraints and Codex's hypothesis.

| Codex proposal | Possible first slice | Main risk |
| --- | --- | --- |
| [Posts as a live conversation anchor](01-post-to-talk.md) | A live Talk host can choose one currently visible public post to discuss | Crowding Talk's compact panel or exposing a deleted/blocked source |
| [More human-made media in Posts](02-human-made-posts.md) | Let someone make a square image for a post using their chosen photo or blank canvas | Another editor path could make the post composer harder on mobile |
| [Local exchanges and trails](03-local-exchange.md) | Let a human-authored offer/request post show whether it is still open | Stale listings, unwanted labor and marketplace obligations |
| [Private continuity](04-private-continuity.md) | An owner-requested, source-linked Log reflection or safer share preview | Overstated inferences, cost, or private material crossing a public boundary |
| [User-controlled agents and portability](05-open-agency.md) | Narrow, expiring record-scoped grants for an external agent | Complex authority and revocation that users cannot understand |
| [Group posting](06-group-posting.md) | A bounded, human-authored post audience for one group, without group DMs | Membership, history and moderation obligations arriving together |

The options can be combined later, but combining them now would hide their separate privacy and operating costs. A founder-approved direction should be recorded separately, with the founder's actual wording and scope, before any proposal is promoted into a build plan.

For three unranked ways to sequence these ideas, see [alternative roadmaps](07-alternative-roadmaps.md). They remain Codex proposals with no founder approval.

## Codex's tentative preference

If asked to choose one idea to examine first, I would examine a **single public Post as an anchor in an already live Talk**. It makes two shipped surfaces cooperate, needs no new tab, and can remain one exact link in the expanded room. I would reject it if it crowds the room or if authorization makes the source unreliable for listeners. This is my hypothesis, not a founder choice or implementation request. It does not propose scheduled Talk.
