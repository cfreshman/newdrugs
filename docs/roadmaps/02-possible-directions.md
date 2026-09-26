# Eight possible directions

These are different centers of gravity for the same product, not eight modules to build in parallel. Each can preserve the current chat home, manual panels, human profiles and open agent access. The question is what people would primarily come to New Drugs to do.

My provisional preference is **B, making small plans, supported by A, a good local internet**. C, recurring circles, becomes attractive if the first plans repeat. That preference should survive a small real-world comparison before it becomes a year of engineering.

| Path | A person comes here for | Can start with a small existing group? | Distinctive agent contribution | Main operating burden |
| --- | --- | --- | --- | --- |
| A. A good local internet | Interesting people, posts and conversations | Yes | Find and assemble relevant human content | Moderation and keeping discovery honest |
| B. Make small plans | Someone to do a specific thing with | Yes | Resolve interests, options, time and next steps | Cancellations, consent and reliable delivery |
| C. Small recurring circles | People to keep doing things with | Yes | Reduce recurring coordination | Group stewardship and membership boundaries |
| D. A useful private social assistant | Remember and carry out personally chosen intentions | Some value even alone | Memory, reminders, drafts and bounded follow-through | Privacy, authority and background cost |
| E. Neighbors helping neighbors | Borrow, give, learn or help | Yes | Match specific requests with relevant offers | Scams, expectations and coordination failures |
| F. Make things together | Collaborators and small creative projects | Yes, including remotely | Find complementary interests and organize a start | Avoiding job-board and productivity-suite drift |
| G. A shared guide to a place | Worthwhile places, events and local knowledge | Some value before network density | Research current facts and connect them to people | Freshness, attribution and source costs |
| H. An open social service | Use their own client or agent over a useful network | Needs a useful underlying network | Reliable, permissioned orchestration | Compatibility, abuse controls and governance |

“Small group” is a product hypothesis, not a researched minimum user count. No competitor's user numbers or matching claims establish demand for New Drugs.

## A. A good local internet

**The experience.** People post ordinary things, discover voices they like, follow a conversation, and occasionally turn that into a connection. Someone can ask the agent for a feed about a topic or just browse. A good afternoon of funny posts and replies is a valid outcome; it does not have to produce an RSVP.

An example: “Show me the people nearby posting about making things, but include some stuff outside coding.” The agent produces a normal selected-post list with sources. The person reads, follows a thread, opens a profile and decides what to do. Another person reaches the same material through the Posts panel, without using AI.

**First coherent slice.** Add private bookmarks, a basic following relationship for public posts, muting, and a way to save a search or selected list. Keep Following separate from accepted connections. Offer chronological and explicitly selected discovery views. Make unavailable, private, deleted and untagged-area results understandable.

**Then.** Human-curated collections, small topic feeds, temporary themes, a useful “catch me up” view, and opt-in community introductions. Let a person pin a few useful views rather than building a large permanent dashboard. The agent could explain why a post appeared and accept corrections to the current search.

**Much later.** User-created feed recipes, third-party feed clients and multiple community contexts. A recipe should be inspectable: source pool, filters, order and optional semantic intent. It should not become an invisible behavioral profile.

Bluesky demonstrates that feed selection can be a user-facing choice rather than a single imposed ranking. That supports evaluating the interaction pattern; it does not mean its ranking, follow graph or entire UI belongs here. [Primary reference](https://bsky.social/about/blog/7-27-2023-custom-feeds)

**What the agent does well.** Retrieval, filtering, grouping, catching up on a chosen thread and opening the useful native view. It should cite posts, preserve their authorship, and distinguish exact statements from an inference.

**What remains human.** Identity, taste, posting intent and the relationships that result. There should be no background machinery generating posts, likes or comments to keep the feed busy.

**How to test it cheaply.** Invite a real, reachable community to use the existing feed for two weeks. Ask each person to share something they actually wanted to share. Observe whether people voluntarily return, recognize other participants, and find something they would not otherwise have found. Compare a normal chronological feed with a small agent-selected list. Do not require them to use the agent to produce activity.

**Continue if** people seek out this particular community's conversation, not only the novelty of trying an AI tool. **Change course if** the feed is mostly founder prompts, obligation posts or copied links nobody discusses.

**The risk.** It is easy to build a less populated Twitter. Reposts, trending panels, follower counts and increasingly elaborate ranking can consume a year without supplying a reason to care about this network. The social identity of the first community matters more than another engagement mechanism.

**Choose this as the lead** if the founding community already wants somewhere to talk, has a recognizable sense of humor or shared interests, and organically starts conversations through posts.

## B. Make small plans

**The experience.** “Anyone want to play tennis Saturday?” becomes a real, manageable plan: a few interested people, possible times, an agreed place, clear attendance and a way to cancel. The app takes care of the coordination that usually dissipates between an interesting post and an actual meeting.

The first useful plan might involve existing friends. Discovery can bring in someone new when there is enough local participation. This avoids requiring a whole city of strangers before the product works.

**First coherent slice.** A plan card with host, purpose, audience, a time or time poll, an approximate area, optional public meeting place, capacity and RSVP state. Give it a small discussion attached to that plan and a dependable update notification. Keep a person's home area separate from the meeting location. A proposed plan can be edited privately before invitations are sent.

A person should be able to create the whole thing manually. The agent should be able to find relevant public posts, propose a plan, resolve participants, open the draft, and prepare individual invitations for exact review. Accepting a plan should not silently create accepted DM connections with every attendee.

**Then.** Expiring “up for something” intentions, calendar export, optional time polls, cancellation and venue-change handling, waitlists only when actual capacity requires them, and a way to reuse a past plan. Offer a public location the host deliberately chooses instead of collecting precise device locations.

**Much later.** Optional private free/busy integration, verified event/venue research, recurring plans and carefully bounded coordination between people's agents. Sharing calendar availability should not require sharing event titles. Google's Freebusy API is a concrete integration option when it becomes necessary, but a manual poll works first. [Primary reference](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query)

Partiful's current product separates choosing a time from guest questionnaires and RSVP coordination. The transferable lesson is a small set of explicit decisions, not a requirement to replicate an event platform. [Primary reference](https://help.partiful.com/en-us/articles/15525422-can-i-poll-or-survey-my-guests)

**What the agent does well.** Find a few relevant people or existing plans; compare current public options; turn a vague intention into a proposed time/place; explain what is still undecided; keep a changed plan consistent. It should not invent a reservation, assume a person is free, or accept on someone else's behalf.

**How to test it cheaply.** Run a few founder-supported activities using the current posts, invitations and DMs before adding a large plan system. Record the steps that repeatedly require manual coordination. Then build only those steps into the first plan card. Include an ordinary cancellation in the test, not just a happy-path outing.

**Continue if** participants can organize a second plan without the founder doing all the work, and they say the app reduced practical effort. **Change course if** the real problem is lack of interest, incompatible availability or not enough local people; a more complicated planner will not create those missing conditions.

**The risk.** The site could become administrative and lose its personality. Not every joke or social thought should acquire date, venue and attendance fields. Keep plans as an optional thing a post or conversation can become.

**Choose this as the lead** if people already express interest in doing things but the handoff into time/place coordination is where they stop.

## C. Small recurring circles

**The experience.** A one-off photo walk becomes a handful of people who keep walking, or a weekly game night, repair session, language exchange or quiet coworking table. New Drugs helps a group maintain an easy shared rhythm without becoming another noisy server everyone feels obliged to monitor.

**First coherent slice.** A small circle with an owner, explicit invitations, accepted membership, a shared conversation, a short human-written purpose, notification controls and a clear leave action. Reuse the plan card for gatherings. Private membership and content should actually be private, including in search, link previews, notifications and agent context.

**Then.** Recurring plans, co-hosts, a few pinned resources, invitations through current members under a clear rule, and a low-pressure way to welcome someone new. Allow quiet members. Do not expose activity scores or a visible “least engaged member.”

**Much later.** Inter-circle collaborations, community-owned discovery pages and limited local host networks. These should follow observed demand, not precede a working five-person conversation.

BFF's current official description includes both one-to-one friendship and groups. Timeleft makes small shared activities a first-class entry point. Those are useful patterns to examine, not evidence that their matching systems or paid models should be copied. [BFF](https://support.bumble.com/hc/en-us/articles/30781191036317-Changes-to-Bumble-For-Friends-and-Bumble-BFF-Mode), [Timeleft](https://help.timeleft.com/hc/en-150/articles/28529250732444-What-is-Timeleft-and-How-Does-It-Work)

**What the agent does well.** Summarize a conversation the requesting member can currently read, propose the next gathering, locate the relevant plan and remind the owner about a task they asked to remember. A group agent needs its own visible scope; one member's private agent must not acquire everyone's private notes.

**What remains human.** The group's purpose, membership decisions and social culture. A bot should not decide who has failed to contribute enough, manufacture a community persona, or keep conversations alive by posing as a participant.

**How to test it cheaply.** Ask two existing small groups to use the app for one recurring activity. Test late joining, leaving, blocking another attendee and a host being unavailable. Interview the people who did not join or stopped participating, not just the enthusiastic organizer.

**Continue if** the group repeats by choice and needs fewer coordination messages. **Change course if** hosts become unpaid community managers for the app, membership becomes uncomfortable, or conversation immediately moves elsewhere because the app adds friction.

**The risk.** Groups create a substantial new authorization model. A block cannot always erase a person's existence from a shared event, but it must still stop unwanted contact. The rules need to be decided before coding, not patched after an uncomfortable incident.

**Choose this as the lead** if the founder can reach existing clubs, friend groups or small communities with a recurring reason to gather.

## D. A useful private social assistant

**The experience.** The person can say, “Remember I prefer daytime plans,” “Remind me to follow up next week,” or “Let me know if someone posts about a beginner tennis game.” The agent keeps the things they asked it to keep and helps follow through without turning their relationships into a CRM.

**First coherent slice.** Explicit private notes/preferences, a readable memory management UI, deletion and expiry, and reminders delivered only to the owner. A saved search can be run manually before it becomes a background watcher. Make the source and date of a remembered statement visible.

**Then.** Optional saved-search alerts, budgeted activity suggestions, a private weekly catch-up on chosen conversations, and exact scheduled messages when the user supplies the recipient, content and time. A scheduled exact message does not require a model call at dispatch. It does require a visible queue, cancellation and current permission checks.

**Much later.** Delegated coordination under inspectable rules: specified people, allowed actions, an end date, a cost ceiling and a notification policy. Start with private recommendations. Do not jump directly to agents negotiating commitments or sending newly generated outreach in the background.

**What the agent does well.** Retain explicit context, find material across a person's permitted records, prepare a next step and honor a reminder. The most important feature is the person's ability to inspect and correct what the agent thinks it knows.

**What it should not become.** A friendship score, guilt engine, synthetic companion that replaces other people, or a hidden psychological model of contacts. “I mentioned Alex once” is not a request to build a dossier on Alex. Profile authorship remains human.

**How to test it cheaply.** A few participants explicitly save one preference and one reminder. Observe whether the resulting assistance is useful enough that they keep it enabled. Then test a small number of owner-only saved-search alerts. Ask about unwanted interruption and incorrect assumptions as directly as usefulness.

**Continue if** people trust the retained context and can predict what will happen. **Change course if** surprising memory or notifications outweigh saved effort, or costs are hard to explain.

**The risk.** This route can build a capable assistant before there is a social network worth operating. It also creates the largest temptation to infer things silently. It should serve an already useful social loop rather than substitute for one.

**Choose this as the lead** only if early users repeatedly ask the agent to remember, monitor or follow through on specific intentions, and the underlying social records already give those tasks substance.

## E. Neighbors helping neighbors

**The experience.** People offer a spare item, ask to borrow a tool, find someone to practice a skill with, or help with a small task. The useful interaction can be the start of knowing someone, without forcing the person to announce that they are looking for a friend.

**First coherent slice.** Human posts with a small optional “offer” or “request” structure, a clear availability/fulfilled state, an expiry and a reply or invitation path. Start with giving, lending and mutual help. Keep exact pickup addresses private until the relevant people deliberately agree to share them.

**Then.** A few practical categories, return reminders for loans, human-written terms such as pickup windows, and an account-level way to mute requests. Find matching offers by meaning, but always inspect whether the item is still available and the owner is actually offering it.

**Much later.** Community inventories or tool libraries with willing human stewards. Do not add escrow, cash balances, deposits or disputes over payments simply because a request resembles a marketplace listing.

Buy Nothing is an example of a social product organized around neighbors freely offering goods and help. Its scale and commercial structure do not predict this app's outcome. The relevant pattern is that a concrete useful exchange can create a reason to talk. [Primary reference](https://buynothingproject.org/about)

**What the agent does well.** Find relevant offers, help a user describe a request in their own voice, ask the missing practical question and track an explicit return reminder. It should not promise another person's time or property, guarantee a stranger's trustworthiness, or accept an exchange on someone else's behalf.

**How to test it cheaply.** Use existing posts for a limited set of low-risk requests in a known community. Find out whether the trouble is discovery, coordination, stale availability or trust. Only then add the relevant structure.

**Continue if** requests are fulfilled and participants want to offer things again. **Change course if** scams, resentment, demands on a few helpful people or unresolved expectations dominate.

**The risk.** A local classifieds board can overwhelm the social feed. Human relationships should not become a public reputation leaderboard. Avoid treating favors as a compulsory exchange currency.

**Choose this as the lead** if a real neighborhood or existing community already exchanges help and lacks a useful coordination space.

## F. Make things together

**The experience.** Someone finds a person to shoot a tiny film with, build a weird website, learn a song, organize a neighborhood zine or try an experiment. The reason to meet is a shared thing, not a personality-matching score.

**First coherent slice.** A human-authored project invitation attached to a post: what someone wants to try, approximate commitment, a next meeting or remote session, and whether they are looking for a collaborator or just sharing progress. The first result should be a conversation and a small first session.

**Then.** Small project circles, a few shared links/files, the next agreed action, show-and-tell posts and optional recurring sessions. Keep portfolios and claims of experience human-authored. Public work samples can be linked with permission, but an agent must not invent credentials or imply that generated work was done by the person.

**Much later.** Short-lived public collaboration calls, community showcases and interoperable project tools. External tools can remain responsible for source control, large files, audio production and professional project management.

**What the agent does well.** Search for explicit interests, suggest a manageable starting scope, find overlapping availability and assemble the relevant context. It can help prevent “we should make something” from turning into an unbounded unpaid project.

**How to test it cheaply.** One weekend or a few short sessions, with a small opt-in group and a deliberately tiny deliverable. The person should be able to participate manually. Evaluate whether people actually wanted another session after the initial novelty.

**Continue if** collaborations begin and participants feel the expectations were clear. **Change course if** the app turns into speculative recruiting, unpaid labor solicitation or abandoned project directories.

**The risk.** It can drift into a job board or a full productivity suite. Paid work, ownership of work and shared financial commitments require separate product decisions. A casual collaboration tool should not silently imply those terms.

**Choose this as the lead** if the founder's reachable community is full of people who make things and already ask for collaborators.

## G. A shared guide to a place

**The experience.** “What would be worth doing around here this weekend?” returns a few current options and, separately, people or public posts relevant to them. The person can read, save, invite someone or form a plan. Local knowledge becomes usable without an algorithm pretending to know everyone's taste.

**First coherent slice.** Improve the agent's existing web-research-to-post-list flow. Return source links, actual dates, the place, approximate cost and what is still unverified. A suggestion is not a booking. A saved place should be something a person chose to keep.

**Then.** A small human-curated local guide, public venue anchors, bookmarked activities, source freshness indicators and a way to report a stale or cancelled event. Begin with a limited place and a few trusted source types, such as venue calendars and local institutions.

**Much later.** A maintained activity dataset with permissioned ingestion, expiration, duplicate handling, provenance and a sustainable refresh budget. A venue map can be useful; a live map of people is a different and much more intrusive feature.

**What the agent does well.** Research current options, compare them against explicit constraints, and connect a finding to a social action. It should not pass private conversations or calendar contents into web search, scrape an entire local publication into the app, or claim a venue has confirmed something it has not.

**How to test it cheaply.** Ask a small cohort to make one real decision using the current web-search agent. Track wrong dates, stale details, inaccessible places, cost surprises and whether the suggestions lead anywhere useful. Use that evidence to decide what structured data is worth maintaining.

**Continue if** people choose useful options and the data can be kept current at reasonable effort. **Change course if** the product mostly duplicates search engines while adding unreliable summaries.

**The risk.** Fresh local information is an ongoing service obligation. A large scraped event directory may look impressive while creating a quiet burden of corrections and rights/terms work. Do not let venue promotion or sponsorship determine what gets recommended.

**Choose this as the lead** if there is not yet enough social density, but the agent can provide useful local context that helps a real community form.

## H. An open social service

**The experience.** A person uses the normal site, their own agent, or a small alternative client. They can move their own data and revoke access. Developers can build useful views without constructing a competing social database or a hidden permission bypass.

**First coherent slice.** Improve the foundation already present: clear capability documentation, reliable versioned operations, good examples, an inspectable connection screen, export, deletion and more specific delegated scopes where needed. Keep account access and consequential actions understandable.

**Then.** A small SDK, a documented change/subscription contract, user-selected feed recipes, import/export formats and a few genuinely useful external clients. Let actual integrator needs drive the extension points.

**Much later.** Evaluate protocol bridges, independent hosting or federation after choosing what data can be public and what portability should mean. AT Protocol's account portability and layered architecture are concrete references, not a reason to replatform the MVP. A publicly replicated record system must not quietly receive private groups, DMs or location details. [Primary reference](https://atproto.com/guides/overview)

**What the agent does well.** Operate the real app with the person's preferred model and tools, while retaining exact receipts, authority and cost boundaries. External use remains free from New Drugs' side within fair shared-resource limits.

**How to test it cheaply.** Support a few trusted external-agent users and one small custom client that solves a real problem. Observe whether the same operation behaves consistently in the browser, hosted chat and CLI. Test revocation and deletion, not just connection setup.

**Continue if** useful third-party tools emerge and can be supported without breaking the simple app. **Change course if** the work is mostly protocol engineering for an empty network.

**The risk.** This path can consume all available development time while giving ordinary people little new value. Open interfaces are already a core commitment. Becoming a protocol ecosystem is a separate strategic choice.

**Choose this as the lead** only if a real developer community and useful social usage both exist. Otherwise, keep it as an enabling layer underneath another path.

## Directions that can cross several paths

**Play and small experiments.** Human-origin prompts, temporary clubs, public show-and-tell, shared games and deliberately odd activities can fit A, B, C and F. They should provide their own enjoyment, not act as engagement chores. The agent can help organize; it does not need to supply every joke or become a fake participant.

**Remote friendship.** A video call, game session or shared creative activity can be a complete social outcome. Keep All discovery and remote options. Pair.video is already an explicit reference; use real user-created links until a supported room-creation contract is established. This study does not assume an API exists.

**Visiting another place.** Distinguish “I live around here” from “I want to do something there.” A temporary search area or public meeting anchor need not change a person's profile or publish their travel itinerary.

**Public institutions and local hosts.** Libraries, clubs and community spaces can provide reasons to gather and reachable early groups. Partnerships should be human-run and opt-in. A listed venue is not automatically an official partner.

## Strategic forks I would keep outside the first roadmap

- **Dating:** potentially adjacent, but a meaningful change in intent, expectations and safety. It should be an explicit opt-in product decision, not a hidden layer of BFF discovery.
- **Paid marketplace, ticketing or deposits:** introduces financial relationships and disputes beyond AI credit. Start with links to existing providers if a plan needs a ticket.
- **Home hospitality and rides:** real social value is possible, but trust and physical-safety obligations are substantially different from meeting at a public place.
- **Professional networking/recruiting:** some collaborations will become work, but lead-generation incentives would change the network's culture.
- **AI companions or synthetic members:** could generate conversation volume, but would undermine the current purpose of connecting people to other people.
- **A universal personal assistant:** technically adjacent to the operating layer, but broad life administration should not consume the social product before its core loop works.

These forks are not automatically forbidden forever. They require a new product decision instead of arriving as an accidental consequence of a flexible agent.
