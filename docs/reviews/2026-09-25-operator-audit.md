# New Drugs operator audit, September 25, 2026

Production inspected: v0.11.1. This is an assessment, not a change list that has been implemented.

## Scope and evidence

I used the production social CLI and separate operator CLI, read operation schemas before calls, exercised discovery, people, posts/replies, DMs, notifications, wallet, storage, private chat search, automations and inbox reads, and resolved 15 native destinations. I inspected the guest flow in a real browser at desktop and 390 × 844 mobile dimensions. I inspected relevant UI/server code and read-only host/database operational state.

The complete existing suite passed: **206 tests across 31 files**. Four additional isolated-cloud-test probes reproduced the hidden-profile, deployment/retry, automation-credit and primary-credit-overrun issues below. Live account actions were reads. No posts, invitations, messages, payments or automation runs were submitted. Browser loading created the ordinary guest session. Search reads create their normal short-lived retrieval records and use platform-funded embeddings.

Authenticated UI coverage comes from code and the test suite, with live authenticated operations through the CLI. I did not sign into the real user's browser account, exercise a physical iPhone keyboard/push delivery, make a payment, or initiate a new paid hosted-agent conversation. DigitalOcean backup settings were not available in this inspection.

## What is working

- Production and dev services were active, with no failed systemd units or service restarts since their latest deployment.
- All **18 existing production agent runs** were completed. There were no pending usage reconciliations, outstanding credit holds without active work, or pending public/private search indexing jobs.
- Production contains two indexed discoverable profiles, three top-level posts and one reply. The discovery limitation is currently real inventory, not a stalled index.
- The live wallet reflects actual usage, with no reserved credit in the inspected account. Direct CLI reads did not run the hosted model.
- Posts, replies, accepted connections and DMs returned the expected records and exact application links. Public and private search are separate.
- The guest launcher and Connected agents settings correctly lead into account creation. The mobile landing and account panels remained usable at the inspected viewport.
- The shared starter pool reports $100 budget, $28 allocated and $72 remaining. Allocation is not equivalent to provider expenditure.

## Findings, in recommended order

### 1. Urgent: deployments are filling the droplet

**Confirmed on the host.** Root filesystem: 24 GB total, 22 GB used, approximately 1.8 GB available, **93% full**. There are **61 retained deployment directories**. Dev releases use about 13 GB and production releases about 4.5 GB. Individual recent releases are about 287 MB.

The deployment script installs a full dependency tree into every timestamped release and never prunes old releases. Repeated small deployments, including my own, accumulated this. A few more deployments can exhaust the remaining disk and interfere with application/database writes.

Keep the active release and a small explicit rollback set for each stage, prune only unreferenced older release directories, and add a disk-space gate before deploying. Application data needs separate retention rules.

Evidence: [deployment workflow](../../scripts/deploy.mjs), host `df`, release-directory counts and `du`.

### 2. Primary chat can exceed available credit and collect the difference after a later top-up

**Reproduced in the isolated database with synthetic provider usage, not a paid provider call.** Starting with $0.06 available, I recorded $0.10 of primary-turn usage. The app charged $0.06, displayed a zero balance, and did not request cancellation. After completion, I added a synthetic $1 top-up and reconciled the same provider usage again. The balance became **$0.96**: the previously uncollected $0.04 was charged from the new credit.

The primary chat admission hold is not a spending ceiling. Periodic metering and budget-triggered cancellation are currently applied to automations, not primary turns. The exported `guardSpend` helper is not called by the hosted execution path. Reconciliation continues revisiting completed runs, allowing the outstanding difference to be collected later without a separately visible debt balance.

No such overrun was observed in the existing production records inspected. This is a reproduced boundary failure that should be fixed before a user encounters it. Enforce funded spending during primary execution, account explicitly for unavoidable provider-reporting delay, and make the overrun policy deliberate. A displayed zero balance should not conceal a future claim on a new top-up.

Evidence: [usage settlement and admission](../../server/wallet.ts), [primary/background execution and reconciliation](../../server/agent.ts), isolated credit probe.

### 3. Deployments invalidate unrelated reviews and identical retries

**Confirmed in code and reproduced in the isolated database.** Every operation shares one version derived from a broad hash of CLI, prompts, schemas and server files. Review digests and idempotency fingerprints incorporate that version. An unrelated change can therefore invalidate an already reviewed action or an identical retry of an action that already succeeded.

The probe created one post, changed only the operation version in memory, and retried the same operation/input/key. It received **“This key was already used for a different action.”** There was still exactly one post. The safety check prevents duplicate execution, but fails to return the known successful receipt.

The same global-version mechanism can produce the user's earlier “tool call changed after review” error without the person changing the reviewed input. That is a supported explanation, not proof of which deployment caused that particular historical error.

Version the meaningful contract of each operation. Preserve successful idempotent receipts across compatible deployments. If a real contract change invalidates a pending review, explicitly replace it with a fresh review rather than making the person negotiate with the LLM to try again.

Evidence: [version hash](../../scripts/version.mjs), [review validation](../../server/agent.ts), [write fingerprint](../../server/operations.ts).

### 4. Search returns weak matches as ordinary results

**Confirmed with live production reads.** Searching posts for `marine biology` returned the reply **“im a what”**. Searching people for `coding` returned a profile whose listed interests are reading, tennis and urban planning, with no coding evidence. A search for `wizard` correctly ranked the wizard post first, but also returned weakly related material.

Both public and private retrieval admit semantic similarity around 0.2. This is a retrieval candidate threshold, not evidence that the person or post satisfies the user's request. The UI does not distinguish these weak candidates from good matches. With a small population this can make an automation manufacture relevance.

Calibrate no-match behavior against real positive and negative queries. Keep broad discovery possible, but do not present weak semantic neighbors as satisfying a specific interest. Ranking improvements should respect the user's topic, without switching to popularity.

Evidence: [public retrieval](../../server/search/retrieve.ts), [private chat retrieval](../../server/search/chat.ts), saved local audit results.

### 5. `connections` has two incompatible meanings in the control plane

**Confirmed live.** `connections.list` returns invitations and accepted human relationships. `app.open` with `view: "connections"` returns **`https://druggie.org/agents`**, which is Connected agents settings.

An agent following the operation names can send someone asking about friends to API-token settings. The existing `messages` destination reaches social messages/invites, but the naming is misleading.

Give external-agent settings and human connections distinct view names and explicit descriptions. Keep old links compatible while changing the canonical tool vocabulary.

Evidence: [native routes](../../shared/navigation.ts), live `app.open` results.

### 6. An automation can silently stop permanently because of a temporary credit condition

**Reproduced in the isolated database.** A scheduled automation with insufficient available credit becomes `paused`, loses `nextRunAt`, and gets a `blockedReason`. No notification or run-history entry is created. Adding credit later leaves it paused. Hitting the daily allowance takes the same permanent-pause path, even though that allowance resets the next day.

The user can reasonably read silence as “nothing useful to report,” which is explicitly a valid successful outcome. Today it can also mean “the automation stopped and needs manual attention.” The reason appears only inside its detail view.

Distinguish a successful quiet run, temporary deferral, intentional pause and action-needed failure. Temporary budget exhaustion should not disable recurrence forever. Surface genuine failures or required intervention in the existing inbox/notification UI, with direct recovery controls.

Evidence: [scheduler admission and error handling](../../server/automations.ts), [automation UI](../../src/AutomationsPanel.tsx).

### 7. A person's profile does not lead to their posts

**Confirmed in UI implementation and the live operation schema.** A profile has photos, bio, interests and relationship actions, but no post/reply timeline. `posts.list` has own/public/selected scopes without an author filter. `posts.search` supports author filtering but requires a nonempty topic query.

The natural exploration path is “this person seems interesting; what do they actually post?” Currently the user or agent must search for an invented topic or filter a global feed themselves.

Add a normal author-filtered post list and expose it on the existing profile panel. This connects existing parts of the app without introducing a new social construct or engagement goal.

Evidence: [person panel](../../src/PersonPanel.tsx), [profile renderer](../../src/ProfileCard.tsx), [operation catalog](../../shared/catalog.ts).

### 8. Relationship and profile-visibility states have unfinished edges

**Hidden-profile inconsistency reproduced in the isolated database.** After two people connect, turning off one person's discoverability leaves `connections.get` returning their profile, while `people.get` for that same person returns `Not found.` The person panel calls `people.get`, so a connected person's profile can become a dead end despite their DM relationship remaining valid.

**Also confirmed in code:** there is no ordinary disconnect operation. A declined invitation keeps the pair in a declined state, and future requests return that existing record; the recipient has no clear way to reconsider and initiate a new invitation. Blocking is the only way to stop an accepted relationship through current controls.

Define visibility for discoverable strangers, invite participants and accepted contacts, then use that rule consistently. Add an intentional relationship-ending/reopening path without making people use Block for every change of mind or permitting repeated unwanted invites.

Evidence: [profile and connection operations](../../server/operations.ts), [person UI](../../src/PersonPanel.tsx), [upload authorization](../../server/uploads.ts).

### 9. Operator report handling cannot resolve the underlying problem

**Confirmed through the live operator catalog and implementation.** The operator can list/read reports and mark them resolved or dismissed. The review operation explicitly does not remove content or suspend anyone. There are no operator operations to take those actions. The user report flow targets a person rather than capturing a specific post/message as evidence.

CLI management is the right surface for this app. What is missing is a small set of scoped, audited actions and usable evidence, not another admin frontend. Before admitting strangers, the operator needs a supported way to stop abuse without editing MongoDB manually. Do not broadly expose private messages to the operator; a report should carry the explicitly submitted evidence.

Evidence: [operator CLI catalog](../../server/adminCli.ts), [report UI](../../src/PeopleSafety.tsx).

### 10. CLI discovery pagination is incomplete

**Confirmed live and in argument parsing.** Empty discovery returned 12 of 65 operations with `complete:false` and a `nextCursor`. Keyword `post` returned 12 of 17. The CLI `search` command has no cursor or limit option; it joins the remaining arguments into the query. MCP/API search already supports a cursor.

Add explicit CLI pagination or an all-results mode. A user can work around this with narrower searches or known operation names, but external agents should be able to enumerate the actual catalog reliably.

Evidence: [CLI search parsing](../../cli/index.ts), [server discovery pagination](../../server/operationSearch.ts).

### 11. Recovery and diagnosis are not yet a complete operator workflow

**Verified gaps plus an explicitly unverified dependency.** `/api/health` pings MongoDB. It does not report stuck workers, failed automation admission, old pending usage, push-delivery failure or low disk. Those require SSH/database inspection today. I found no application backup/restore procedure or scheduled backup job in the inspected repo/host timers. **This does not establish that DigitalOcean backups are disabled; those settings were not inspected.**

The deployment workflow also records timestamps and public versions without a source commit identifier, and much of the deployed implementation is still uncommitted locally. Artifact rollback exists, but reproducing and comparing an old release is harder than it should be.

Add concise operator health/status reads, actionable failure alerts, a verified off-host backup/restore procedure covering Mongo and uploaded files, and releases tied to source commits. No large dashboard is necessary.

Evidence: [health route](../../server/app.ts), [deployment script](../../scripts/deploy.mjs), host timer inventory, repository working-tree state.

## Smaller gaps worth keeping on the list

- **Automation history stops at the first 20 runs in the UI.** The API supplies `nextCursor`, but the panel discards it and has no older-runs control. It also drops `usagePending`, so an incompletely metered run can look like a settled zero-cost run. [Panel](../../src/AutomationsPanel.tsx)
- **One unavailable internal source hides an entire inbox update.** `inboxView` replaces all title/body/links when any source check fails. This is privacy-conservative, but a roundup becomes unusable if one profile becomes private. Source-level provenance would allow unaffected material to remain usable. [Inbox projection](../../server/inbox.ts)
- **Account deletion/export are missing.** Account settings supports username/password changes and clearing agent chat, not leaving with or deleting the whole account. Password recovery is explicitly absent and disclosed during signup; the user has already deprioritized email recovery. [Account settings](../../src/AccountSettings.tsx)
- **Small remaining balances are not spendable in primary chat.** A new reply requires $0.06 available even if the eventual reply costs a fraction of a cent. The error explains this, but the balance can still look usable. This is an admission-policy/UX issue rather than missing billing reconciliation. [Wallet](../../server/wallet.ts)
- **Saved automations retain only the final generated instruction.** The new base policy helps prevent stale profile snapshots, but original request versus agent-added details are not separately preserved on the definition. The current saved worldwide-friends instruction still contains the old tennis/coding snapshot; the deployment intentionally did not rewrite an approved user configuration. That makes future edits and explanation harder. [Definition schema](../../shared/automations.ts)

## Operator recommendation

First fix release retention, primary credit enforcement and verify recoverability. Then repair version/retry handling, search no-match behavior, navigation naming and automation failure recovery. The most useful modest product addition is a person's posts on their existing profile. After that, complete relationship lifecycle and CLI moderation controls before broadening the audience.

I would judge this work by successful, understandable completion of ordinary tasks: finding genuinely relevant content, inspecting a person, making or ending contact, knowing whether an automation ran, and recovering from a failed action. The audit does not suggest optimizing posting behavior, reactions or time spent in the app.
