# Evidence, references and decisions still open

Reviewed September 25, 2026. Product pages establish what a service describes, not that its mechanism works well or that its users would adopt New Drugs. The proposals in this pack are judgments to test, not conclusions established by competitor feature lists.

## Primary public references

| Source | What was useful | Limit on the inference |
| --- | --- | --- |
| [BFF transition/support page](https://support.bumble.com/hc/en-us/articles/30781191036317-Changes-to-Bumble-For-Friends-and-Bumble-BFF-Mode) | Its current description includes both one-to-one friendship and groups | Does not prove groups are the right first move for this community |
| [Timeleft's current explanation](https://help.timeleft.com/hc/en-150/articles/28529250732444-What-is-Timeleft-and-How-Does-It-Work) | A concrete shared activity can be the entry point to meeting people | Do not copy its paid model, hidden group assignment or matching claims as requirements |
| [Partiful's polling help](https://help.partiful.com/en-us/articles/15525422-can-i-poll-or-survey-my-guests) | Choosing a time and collecting a guest answer are explicit, separable interactions | Does not justify implementing a full event platform |
| [Bluesky custom feeds](https://bsky.social/about/blog/7-27-2023-custom-feeds) | Users can choose among different feed approaches | Does not settle New Drugs' default feed or require a public popularity system |
| [Bluesky starter packs](https://bsky.social/about/blog/06-26-2024-starter-packs) | A community can offer a contextual entry through recommended people and feeds | New Drugs would need its own consent and relationship-visibility rules |
| [Buy Nothing's account of its purpose](https://buynothingproject.org/about) | Freely offering goods/help can supply a concrete social reason to interact | Does not imply marketplace operations are easy or that its economics should transfer |
| [Hall, friendship formation study](https://journals.sagepub.com/doi/10.1177/0265407518761225) | Time together and shared leisure were associated with closeness in the studied populations | Not a causal test of an app, a universal timer or a basis for scoring relationships |
| [WebKit on Home Screen web push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) | Installed web apps have a standards-based notification path with a user-gesture permission request | Actual current device/browser behavior and failure cases still require testing |
| [Google Calendar Freebusy reference](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query) | A provider can return busy intervals without returning event titles in this response | Access, provider errors and incomplete data must still be handled; free time is not social consent |
| [Photon repository and demo policy](https://github.com/komoot/photon#demo-server) | The current provider supports type-ahead and permits reasonable use, without an availability guarantee | A public demo is not a capacity commitment for a growing service |
| [AT Protocol overview](https://atproto.com/guides/overview) | Portability and independently operated infrastructure are concrete architectural goals to study | A bridge is a separate privacy/governance decision, not a drop-in replacement for current authorization |
| [eSafety's Safety by Design framework](https://www.esafety.gov.au/industry/safety-by-design) | Responsibility, user autonomy, transparency and real reporting processes belong in product design | This is design guidance, not a legal compliance determination for New Drugs |

These are primary product, platform or research sources. No recommendation depends on a Reddit anecdote, a vendor's growth number or a promise that “AI matching” has solved friendship.

Pair.video remains a user-specified and already-linked option. Its page was not readable through the text research tool in this study, and no supported room-creation API was verified. That is a verification limit, not a claim that the service is unavailable. A normal user-created call link is a sufficient first integration.

## Reference source inspected without changing the reference apps

| Reference | Transferable detail | Boundary |
| --- | --- | --- |
| [Pangaea group model](../../../pangaea/backend/models/Group.js) and [routes](../../../pangaea/backend/routes/groups.js) | Visibility, entry, posting and moderation are separate rules; viewer projection matters | Do not expose the entire settings matrix in the first New Drugs circle |
| [Pangaea PostsFeed](../../../pangaea/frontend/src/components/PostsFeed.jsx) and [new-post control](../../../pangaea/frontend/src/components/NewPostsNotification.jsx) | Stable reading context, direct controls and deliberate loading of new content | Preserve the current New Drugs shell and navigation decisions |
| [Wayfinder memory core](../../../wayfinder/convex/agentMemory/core.ts), [contracts](../../../wayfinder/convex/agentMemory/contracts.ts), [expiry](../../../wayfinder/convex/agentMemory/expiry.ts) | Ownership, source/revision information, inspection, mode control and expiry checks | Organization/team defaults are not personal-app defaults |
| [Wayfinder external-calendar availability](../../../wayfinder/convex/scheduling/externalCalendarAvailability.ts) | Incomplete data is not availability; disconnected sources must stop affecting results | Avoid importing appointment/CRM assumptions into casual plans |
| [Wayfinder reminder controls](../../../wayfinder/convex/scheduling/reminderMutes.ts) | Muting a kind of notification is distinct from broader contact consent | Do not transplant SMS/email marketing behavior |
| [Wayfinder automation readiness](../../../wayfinder/convex/automationPreconditions.ts) | Agent-visible readiness should agree with the checks that govern actual execution | New Drugs should have a small, social-specific policy |
| [Wayfinder creation/delegation policy](../../../wayfinder/convex/agentRuntime/websiteBuilderPolicy.ts) | Precise direct actions and open-ended artifact creation have different execution needs | A future tiny-tool experiment is not an instruction to import its site builder |

Existing deeper reference studies remain available in [the Wayfinder notes](../wayfinder-study/source-map.md) and [the Pangaea study](../pangaea-study.md). Some historical visual/SDK statements in those files are superseded; current user instructions and source take precedence.

## What this study did not establish

- How many real people are active in a useful local area, or what they want most.
- Whether users prefer public conversation, one-to-one discovery, existing groups or practical plans.
- Actual production conversion, retention, moderation workload or cost distributions.
- That the synthetic semantic evaluation generalizes to difficult real queries.
- That the current host has been load-tested to its configured limits.
- That backups, payment/refund settlement or off-app notification delivery have passed complete production-style exercises.
- A legal status, licensing decision, age policy or cross-jurisdiction compliance conclusion.
- A commitment to buy a service, build a feature, send outreach or change production.

These unknowns are reasons for focused experiments and explicit decisions, not reasons to stop developing the app.

## Decisions that should shape the next build request

| Decision | My starting recommendation | What could change it |
| --- | --- | --- |
| First reachable community | One small community the founder can actually support | A different existing group has a much stronger reason to use the app |
| First product loop | Public conversation leading into a small complete plan | Pilot participants primarily value conversation or an existing circle |
| Meaning of profile privacy | Separate search discoverability from visibility to invited/connected people, with clear behavior | A simpler, well-tested model participants understand better |
| Participation/age policy | Define it before wider recruitment; keep the initial in-person pilot adult and bounded | A deliberate decision to support younger people with the additional design/operating work that entails |
| Starter-credit grant boundary | Move toward a deliberate account/eligibility event rather than every fresh guest session | An equally simple scheme with demonstrably better abuse resistance and less data collection |
| First delivery channel | Test opt-in web push for meaningful events and provide a workable fallback | Device evidence or participant needs favor another channel |
| First background authority | Owner-only reminders and read-only watches | People explicitly request a narrower, inspectable form of delegated action |
| Group history visibility | Choose and disclose it before the first circle launches | The intended circle type has a different expectation, requiring a separate mode |
| Persistent authorship beyond profiles | Keep profiles human-authored; decide community identity and assisted-content policies deliberately | User evidence supports a specific assistive use without manufactured identity/activity |
| Shared costs | An explicit operator budget and voluntary support without ranking privileges | The community deliberately chooses a different no-profit funding arrangement |
| Native app timing | Wait for a measured mobile limitation that matters to the useful social loop | Notifications, voice, device integration or accessibility clearly require it sooner |
| Openness/governance | Improve export, contracts and operational continuity first | Real useful external clients or community stewards justify a larger commitment |

## Why my preferred roadmap might be wrong

**A planning tool may duplicate what the community already uses.** If the group coordinates perfectly well elsewhere and comes here for conversation, a PlanPanel is extra work. That would favor the conversation roadmap, with good links to the tools people already use.

**A private circle may be the stronger initial product.** If the founder can reach established groups but not a dense public community, useful shared space may beat public discovery. It still needs the membership and privacy work described in the circle roadmap.

**The distinctive appeal may be the place's personality.** The playful name and human voice should not be treated as decoration around a scheduling engine. If people enjoy this particular conversation, preserve it. Test first-use understanding without automatically rewriting the brand into a straightforward marketing brochure.

**A capable agent may not be the reason ordinary users return.** It can remain an excellent way to operate the app even if most people prefer buttons. Conversely, external-agent users may already have private memory and calendar context elsewhere, making a second proprietary memory system a weak priority.

**A local guide can provide value while failing to create a social network.** Useful recommendations alone do not prove that people will interact. If this path is chosen, test the handoff into shared activity or human knowledge rather than counting generated suggestions.

**The first cohort can flatter the product.** Friends of the founder may tolerate friction and show up out of goodwill. Reduce founder intervention, include people unfamiliar with agents and talk to those who disengage before generalizing.

These are real alternatives to my initial preference. The pilot should be designed to reveal them, not to confirm a decision already made.

## How the recommendation should be revisited

Pick a first experiment and write the expected result before starting. After a few actual cycles, compare what happened with the alternatives. It should be possible to choose “more of the local conversation,” “a better plan flow,” “a private circle,” or “this community/use case is not working” without treating any of those answers as a failure of the overall idea.
