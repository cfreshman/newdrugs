# First community runbook

Companion to [the v0.38.1 direction](10-v0.38.1-direction.md). This is a proposed, small field test of the shipped app. It is ready to review and adapt. No participant has been contacted, no trial activity has been created, and no production change is authorized by this document.

## The question

Will a reachable set of real people use New Drugs to find something or someone worth a second interaction, with less confusion or social friction than they would have had otherwise?

The founder chooses the people and the setting. The first group should have a credible reason to encounter each other. A mix of existing friends and new introductions can make Circle meaningful without pretending that mutual friends guarantee trust. Nearby remains a coarse area choice; All people stays available. Remote conversation can count as a complete outcome.

The September [pilot study](06-pilots-measurement-and-funding.md) suggests 12 to 25 willing people for two to three weeks. That is a manageable example, not a claim about a minimum viable network size. Begin with fewer if the founder can support fewer well.

## Founder choices before inviting anyone

| Choice | What needs to be decided |
| --- | --- |
| Community | The actual overlapping people or scene, and why they might enjoy being here together. |
| Invitation | Who will ask each person, through an existing relationship. The participant should understand the app is an experiment and may be quiet. |
| Boundaries | Adult participation for the first in-person cohort, how to report a problem, how to leave, and what feedback the founder will ask for. |
| Activity | Whether to host one optional public Talk or share a few real posts. Participants choose whether to write or join; there are no seeded identities or generated posts. |
| Support | When the founder will be available to answer a stuck participant, and when that help will intentionally taper off. |

These are human decisions. Codex can prepare the UI, inspect operational state and draft materials for review; it must not send invitations or publish posts without the founder's specific instruction.

## Product preflight

Use two ordinary accounts and at least one physical phone. Keep test records clearly separate from participant records and remove them afterwards. The purpose is to discover a blocker, not to certify all features at once.

1. Open a direct person and post link as a signed-out visitor and as each account. Check the correct destination survives sign-in and a refresh.
2. Save a human-written profile with a photo, browse Nearby, All and Circle, and verify blocks and hidden people are respected. Do not use the Agent to complete the manual path.
3. Write a post with an image or link, find it from another account, reply, share, and return without losing the prior list position.
4. Send a specific invitation, accept it, read its original text in Messages, send a DM, and check the notification on a second device.
5. Start and answer a DM video call, including after the caller navigates away. Verify ringing, camera/mic permissions, fit, end duration and return to the DM.
6. Open a Talk, join from another account, request to speak, approve, mute, leave and refresh. Verify the participant counts, sounds, mobile bottom panel and that the app remains usable while Talk continues.
7. Open and close a private Log entry. Confirm that no ordinary public or website path exposes it. Check only the Log behaviors the pilot may rely on.
8. Check the exact worker heartbeat, queue age and public API health after the journey. A successful database ping alone does not prove media, search or notification delivery.

Record each blocker with the action, device, expected result and actual result. Fix a blocker that prevents the ordinary social path. Defer visual polish that does not change that path. A test pass is not a promise about every phone or concurrent room.

## Participant journey

Give people a natural choice at arrival. One participant might open a friend's profile, another a relevant post, another the app itself. Watch whether they can answer three simple questions without instruction: who is here, what can I do, and who will see it?

The first useful action can be reading something worthwhile, replying, finding a person, sending or receiving an invitation, joining Talk, or asking the Agent for a real task. Do not count a completed onboarding form as the social outcome. A person who does not want to post or add a photo should still be able to take part.

If the founder hosts a Talk, make it a genuine optional conversation. The app's title and description explain the subject; nobody needs to perform an AI-generated activity. If people move into DMs, calls or an offline plan, let that happen. Log can privately record an actual hangout after the fact; it is not a public proof requirement.

## Observation without surveillance

Keep a small operator notebook, not a feed-engagement dashboard. For each consenting participant, a private code is enough. Do not copy message bodies, Log notes, precise locations, contact lists or microphone content into the notebook.

| Field | Example of the level of detail to record |
| --- | --- |
| Entry path | Friend's link, post link, direct visit. |
| Intended action | Browse people, reply, ask to join Talk. |
| Outcome | Worked, got stuck, chose not to continue, continued elsewhere. |
| Friction | “Could not tell who could see my reply,” with consent to retain that feedback. |
| Return | Participant says they chose another exchange; no need to inspect private content. |
| Operator work | Approximate minutes spent helping or correcting a failure. |

Ask a person what was useful, surprising, uncomfortable or missing. Ask people who left. At the end, distinguish an app failure from an empty community, awkward invitation, lack of interest or timing. Avoid turning a tiny sample into a percentage claim.

## Rhythm and review

- **Preparation:** select the group, run the product preflight, fix blockers and agree on support/report handling.
- **First days:** invite through real relationships and help people get unstuck. Do not prescribe a posting quota.
- **Later days:** reduce founder prompting. Notice whether people initiate another interaction on their own.
- **Review:** hear from both returning and disengaged participants. Choose the most repeated obstacle that software can actually remove.

The review has four plausible outcomes:

1. **Human conversation is working.** Keep the community small and improve the specific discovery or reading friction that participants encountered.
2. **People want contact but coordination fails.** Scope one complete, narrow plan flow with change and cancellation behavior.
3. **Participants mainly value an existing group or public Talk.** Study group posting or planned Talk separately. Circle does not become a group chat.
4. **Few people choose a second interaction.** Revisit the community and promise. A new feature is not automatically the answer.

Write the actual evidence and a disconfirming observation before committing to another release. The founder makes that product choice. The next build should have a short acceptance path on the same two devices and a clear reason to stop if it does not help.

## Keeping it sustainable

The pilot can run on the current single-host setup, subject to its real-time media and queue behavior. Current scaling repairs remove several old unbounded paths, but they do not prove large load. Do not run stress tests against the shared production host. Watch actual provider receipts, LiveKit joins, worker lag, object storage and moderation effort. Hosted Agent use is billed at cost; external CLI/MCP operations remain free from New Drugs' side. Platform search and infrastructure are separate shared costs.

The founder deferred backups until traction. Do not silently turn this runbook into a backup project or a requirement for the first invitation. Record that operating choice and revisit it when usage changes.
