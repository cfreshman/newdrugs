# Learning whether this is useful, and keeping it affordable

The app's purpose is social usefulness. We should measure that directly enough to make decisions, without building a surveillance system or pretending a tiny pilot proves broad demand.

## A practical first pilot

**Choose a reachable community, not a demographic fantasy.** A local group, a set of friends with overlapping interests, a maker community or a recurring activity is more useful than a large anonymous signup list. Start somewhere the founder can actually support. New England is a natural beginning; it does not need to become a permanent geographic restriction.

A proposed first size is roughly 12–25 willing participants over two or three weeks. This is an operating suggestion, not a minimum network-effect threshold or a statistically powered study. Use a smaller cohort if that is what can be supported well.

Give participants more than one way to get value. They can share posts and talk, try a small plan, or browse a useful list. Do not require a public profile photo, a long bio, a prompt-writing lesson or a paid AI conversation just to test the normal controls.

Have at least some people use only the manual UI. Invite a few to use hosted chat, and a small number who already use external agents to try the CLI. The comparison is exploratory, not a randomized causal experiment. We are looking for avoidable friction and missing capabilities.

### A suggested sequence

1. **Before arrival:** agree on the pilot's purpose, who handles problems, how to leave and what feedback will be collected. Do not scrape contacts or populate fake members.
2. **First visit:** observe account creation, a human profile choice, one discovery task and one ordinary social action. Let the person explain what they thought would happen.
3. **First week:** allow ordinary conversation. Support a few genuine activity or collaboration proposals, using current controls where possible. Record the coordination steps rather than pre-deciding that an event system is the answer.
4. **Second week:** reduce founder assistance. See which conversations, plans or groups people voluntarily continue. Include a cancellation, a changed detail and someone who never enables notifications.
5. **Review:** talk to participants who disengaged as well as those who enjoyed it. Choose the next product slice based on the repeated obstacle and the activity people wanted to repeat.

No invitations or messages are being sent as part of this roadmap study. Outreach and the actual pilot require the founder's later choice of people, wording and schedule.

## Questions that produce better evidence than “do you like it?”

- What did you come here to do?
- What happened that was useful, funny or worth returning for?
- What did you expect the agent or a button to do that it did not do?
- Did you understand who could see your profile, post or plan?
- Was there a moment you wanted to do something yourself but had to ask the agent?
- Did the app create coordination work for you or for the organizer?
- What would you have used instead?
- Was any notification, memory or suggestion unwanted?
- Did you want to talk to or do something with someone again?
- If you stopped, what would have made a difference, and what would not?

Ask these as conversations. Do not turn them into another lengthy onboarding form.

## Experiments to choose among the roadmaps

| Experiment | Hypothesis | Small test | Evidence to inspect | A reason to stop or change |
| --- | --- | --- | --- | --- |
| Human local conversation | A particular community has something it wants to share here | Existing posts and replies for a limited cohort | Voluntary return, recognition, useful/funny discoveries and conversation | Activity only appears after founder prompts |
| Selected-post feed | A few relevant posts are more useful than more scrolling | Ask for a list, compare it with ordinary browsing | Opened sources, useful corrections and what the person did next | Polished summaries conceal weak or irrelevant evidence |
| A complete small plan | Practical coordination is the missing step | A few real proposals, then a narrow PlanCard | Whether time/place/attendance become clear with less work | Interest or availability is absent regardless of UI |
| A recurring circle | Repeated shared activity sustains use | Two willing existing groups through multiple cycles | Repeat participation, host effort, leave/mute behavior | Organizers carry an increasing management burden |
| A helpful exchange | A practical offer/request creates a reason to connect | Limited low-risk offers and requests | Fulfillment, stale status, clear expectations and repeat willingness | Scams, resentment or unclear obligations dominate |
| A tiny collaboration | A bounded shared project is a better entry point than generic matching | A few short sessions with a small deliverable | A real start, clear scope and desire to continue | Unpaid-work expectations or abandoned directories |
| A private reminder | Explicit follow-through is worth a little retained context | One chosen reminder/preference per participant | Correctness, trust, saved effort and whether it stays enabled | Surprise, guilt or interruption exceeds the benefit |
| A local guide | Current external options can help before network density exists | A few real decisions using source-linked research | Accurate facts, useful choice and source-maintenance effort | It duplicates search while adding errors |
| External-agent parity | People can use their preferred agent without losing app capability | Real read/write tasks with exact permitted outcomes | Schema clarity, receipts, links, revocation and cost behavior | Hidden browser-only gaps or redundant hosted calls |

Before each experiment, write down the expected useful outcome and one disconfirming observation. Otherwise every result can be reinterpreted as a reason to build more features.

## Success measures that fit the site

There is no single metric that should overrule user experience. A useful small set is:

- **Time to a meaningful first action:** a real conversation, useful discovery, saved item or proposed plan chosen by the person. A completed profile form alone is not the outcome.
- **Chosen repeat interaction:** did someone want another conversation, activity or collaboration with someone they found here? This can include remote interaction.
- **Coordination effort:** what steps did the product remove, and what work did it move to a host or operator?
- **Perceived usefulness and comfort:** short voluntary feedback, including whether someone felt pressured or surprised.
- **Action reliability:** correct recipients, current records, duplicate prevention, readable failure and usable recovery.
- **Operator load and actual cost:** support/moderation time, delivery failures, resource consumption and reconciliation gaps.

A connection that continues on Signal, in person or somewhere else can still mean the app worked. Ask whether New Drugs helped, not whether it captured every later interaction. Similarly, a monthly activity can be worthwhile without producing daily use. Keep “people who already knew each other” separate from genuinely new introductions when interpreting the pilot.

Keep views, sessions and message counts as diagnostic signals. More scrolling, more generated text or more invitations are not automatically better social outcomes.

The friendship research reviewed here associates time together and shared leisure with closeness. It supports paying attention to repeat contact, but it does not establish a required number of app interactions or prove that New Drugs can cause friendships. Do not turn it into a progress meter for a relationship. [Hall's study](https://journals.sagepub.com/doi/10.1177/0265407518761225)

### Collect less than it would be convenient to collect

Use aggregate counts and operational IDs where possible. Do not capture chat bodies, exact locations, background microphone data or private social details merely for a dashboard. A person can optionally say a plan happened; do not infer attendance from device movement.

Avoid small-group analytics that reveal an individual's behavior through a count or filter. Let participants decline research feedback. Define retention before collecting a new event stream, and make account deletion/export account for it.

## Deciding when to continue

For a small pilot, a useful example gate might be two participant-organized repeat activities, or several people voluntarily returning for the community's conversation. These are founder-set learning signals, not statistical proof or universal product-market-fit thresholds.

The important distinction is whether the useful behavior persists when the founder stops carrying it. If it does not, ask whether the obstacle is the software, the community, the timing or simply lack of interest. More semantic sophistication cannot solve every empty result.

A route is allowed to fail cheaply. Preserve the broadly useful components and remove the experiment instead of converting it into a permanent unused tab.

## Money should remain understandable

The current product has several different financial concepts:

| Concept | What it represents | What to keep separate |
| --- | --- | --- |
| Paid AI credit | A user's balance for hosted AI consumption | Shared hosting funds and donations |
| Starter allowance | The operator's promise to cover initial usage, bounded by the pool | Cash already deposited with Stripe or the model provider |
| Actual hosted usage | Provider-reported costs and subsequent reconciliation | A guessed per-message charge or a platform markup |
| Platform search cost | Embeddings and shared retrieval operations | A hidden charge to external-agent users |
| Processing adjustment | Actual payment fees versus the estimate | Income silently retained from an overestimate |
| Voluntary support | Money given to support the service under its stated terms | Paid visibility, privileged access to people or influence over recommendations |
| Operator labor | Support, moderation and maintenance work | An assumption that no-profit means nobody has to do it |

The current starter-pool control raises an allowance cap; it does not charge a card or fund a provider balance. That distinction should stay clear in administration and planning.

An initial shared operating budget can be expressed without inventing current vendor prices:

```text
shared operating need
  = infrastructure and backups
  + platform-funded search
  + notification delivery
  + support and moderation
  + provider/payment reconciliation gaps
  + payment-risk reserve

available shared funding
  = explicit operator funding
  + voluntary support under a clear policy
  + other deliberately accepted cost funding
```

Use actual invoices and a documented allocation policy. Unspent user AI credit is not automatically a general-purpose operating budget. Nothing in this roadmap assumes a legal nonprofit structure or tax-deductible donations.

### Three funding approaches compatible with the current direction

**Operator-funded alpha.** Keep the real cohort small, enforce shared-resource budgets and show a simple cost ledger. This is the least complicated way to learn.

**Visible voluntary support.** Continue the existing donation path, with a clear account of what support pays for. If support is to fund starter credit specifically, use a separate cash-backed funding/allocation model rather than treating a raised admin number as collected money.

**Shared stewardship later.** If the community wants to help run the service, define roles, access, expenses and succession. A fiscal host or another structure could be evaluated then. This is a governance decision, not a feature that follows automatically from a donate button.

I would not start with sponsored ranking, paid profile boosts, paid invitations or an attention-advertising model. Even without profit, those change which outcomes the product is rewarded for creating.

## Cost and capacity scenarios to measure

| Scenario | What to measure before choosing infrastructure |
| --- | --- |
| A few dozen people in one cohort | Actual support time, peak simultaneous sessions, indexing latency, stored media and a restored backup |
| Several active local groups | Notification fanout, group authorization cost, agent queue wait, repeated-event scheduling and host moderation time |
| Hundreds of active accounts | Search rebuild behavior, total storage, live-connection limits, release retention and provider/delivery bills |
| A sustained larger public network | A deliberate search/storage/service sizing exercise, abuse controls, on-call expectations and sustainable operating ownership |

The current source limits, including 128 live subscribers per process and 10,000 public indexed documents per stage, are not user-growth milestones. Measure against them early enough to change the architecture before a hard cap becomes the user experience.

The deployment script also retains release directories. Add a bounded retention policy that protects the current and rollback releases; do not let frequent deploys consume the same disk needed for user files and MongoDB.

## Useful stop rules

- If people do not want the underlying interaction, stop adding coordination machinery around it.
- If unwanted contact or operator reports grow faster than the ability to respond, slow recruitment and improve the relevant controls.
- If a background feature regularly surprises users or is disabled, default it off and simplify its scope.
- If a feature needs a growing subsidy, decide explicitly whether to fund, cap, redesign or stop it. Do not quietly add markup or sell visibility.
- If a provider integration cannot be kept accurate or supported, offer a simpler link/manual flow instead of pretending it is reliable.
- If the product starts rewarding generated activity over human participation, change that mechanism even if a conventional engagement metric improves.
