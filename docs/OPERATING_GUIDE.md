# New Drugs operating guide

This is the entry point for operating and continuing work on New Drugs. Read it with [AGENTS.md](../AGENTS.md) before changing the project. It records the current system, the user's decisions, and the practical handoff from the first long build session. Update it when those facts change.

**Verified September 26, 2026. Production: v0.19.1.** Historical research and roadmap documents are useful context, but some describe behavior that has since been replaced. Current user instructions, current code, and the verified state below take precedence over those old plans.

## Handoff state

| Item | State at handoff |
| --- | --- |
| Repository | `/Users/work/dev/newdrugs` |
| Branch | `experiment/log` |
| Pre-Log baseline | Tag `pre-log-v0.19.1`, the shipped system before native Log work |
| Checkpoint tag | `pre-three-mode-20260926` |
| Working tree | The accumulated shipped work is checkpointed before Log integration. Preserve ongoing Log changes; inspect status before editing. |
| Production | `https://druggie.org`, v0.19.1, release `20260926221734638` |
| Cloud dev | `https://dev.druggie.org`, release `20260927014740493`; local frontend at `http://localhost:7330/log` |
| Stage parity | Both have approved utilities. Dev additionally has the native Log experiment. Log has not been released to production. |
| Services | `newdrugs@dev` and `newdrugs@prod` were active; both database-backed health checks passed. |
| Git remote | None configured. “Push” was clarified by the user to mean production deployment. |
| Git identity | Repository-local `Cyrus <cyrus@freshman.dev>` |
| Outstanding requested work | Log implementation is complete on dev within its documented parity map. Physical iPhone recording/playback verification and any production promotion remain separate. |

**The shipped pre-Log system is checkpointed at `pre-log-v0.19.1`.** Preserve tracked and untracked work made after that checkpoint. Do not reset, clean, stash, or revert an experiment casually. Deployment still builds the working tree, not a Git commit. There is no Git remote configured.

Recent completed work includes mode-aware URLs and browser history, bottom-pinned horizontal desktop dragging, the Chat search label, profile action menus with edge-aware positioning, inline profile name/username layout, matching username font sizes, DM jump-to-latest controls, header tap-to-top, and the compact secondary Agent footer. Earlier UI patches also removed an extra 4px inset on the draft post's author row.

This guide does not itself authorize another production deployment, restart of a local frontend, new social activity, or a new feature project.

## Subsequent development

After the original handoff, deletion reviews were unified in `src/DeleteConfirmation.tsx` for posts/replies, stored files, inbox updates, and clearing agent chat. The compact inline card uses the existing soft surface, rounded Cancel control and red destructive control. Escape cancels, clicks stay inside the review, duplicate submissions are blocked, and a successful post deletion dismisses its review. Existing operation authorization and idempotency remain in the caller. This update is live on both stages; production is v0.17.4. The deletion interaction suite passed 63 tests, followed by three focused regression tests for successful dismissal and submission behavior. Production frontend and health checks passed.

The shared discovery guidance was subsequently updated for curated post exploration, with no hardcoded topics or phrase matching and no repetition of post contents in the chat handoff. The selected-list routing passed tests in both Posts and Friends, preserving card order and chat drafts. The targeted navigation/rendering/discovery suite passed 91 tests. This is instruction and catalog guidance, not a deterministic recommendation algorithm or a claim of a fresh live-model evaluation. It is live in v0.18.1; existing hosted sessions adopt the changed specification through the normal session-context path.

Both stages include the admin Users tab/operator `users.list` and `posts.incoming_replies` with a manual Replies to you profile tab. The user approved utility ideas 1–6, documented in [Agent utilities](agent-utilities.md). The other proposed utilities were declined or deferred. These shipped in v0.19.1, with 78 final targeted tests and 48 broader permission/automation checks passing. The production catalog and a DST resolution were also verified without running a model. The approved next project is [native Log integration](log-integration/PLAN.md) from `~/dev/logcal`.

## Product intent and boundaries

New Drugs is made in New England. It is a social experiment intended to make the user's life better through expression, finding people, and making plans. The reference points are Twitter, Bumble BFF, and ChatGPT, but it is its own product.

- The person's enjoyment, expression, and desired connections matter. Likes, replies, reach, posting frequency, and productivity are not default goals. A quiet post is not a problem to fix.
- Human profile text and photos must be authored by the person in the app. Do not generate or write profiles through agents.
- People must be able to manage posts, invitations, DMs, profiles, and automations manually. The hosted agent and external agents should expose corresponding capabilities where appropriate. Credential creation, passwords, and human profile editing are deliberate browser-owned exceptions.
- Hosted AI is paid at cost. New Drugs takes no profit. External CLI/MCP operations are free from New Drugs' side and should not invoke hosted reasoning just to execute an operation.
- No em dashes in agent-composed text. When writing for a user, use that person's actual writing as the style reference. Do not invent personal facts, feelings, promises, or familiarity. Preserve verbatim text when explicitly requested.
- “Tweet” means a post here. Do not keep explaining that the agent cannot post to X.
- Do not invent compatibility percentages, infer sensitive traits, fabricate activity, or optimize a person's posts for engagement without an explicit request.
- Do not add people bookmarks. Saved items are posts. Groups remain deferred. Backups remain deferred until there is traction. The user accepts the existing LLM usage reconciliation policy.

The current welcome lives in [server/onboarding.ts](../server/onboarding.ts), as one editable multiline template. Its closing is the dynamic “Join X others on New Drugs.” with the singular form and a zero-user fallback. There is no starter-dollar sentence. Starter credit still exists. `ensureIntroduction` updates an existing introduction when the template changes.

## Reference apps and working style

Before a new feature, inspect the relevant implementation in the reference app:

- `../wayfinder`: hosted agent behavior, tool discovery, approval semantics, CLI/MCP, durable runs, sleep, automations, billing, and chat behavior.
- `../pangaea`: posts, threads, profiles, navigation, link attachments, rich embeds, and social UI.

These are **read-only references**. Do not edit them, run their tests, restart their services, or deploy them as part of New Drugs work. Port relevant behavior and ideas, not unrelated business concepts or an entire design.

The user expects concrete work, frequent short progress updates, and completed dev deployments. Do not repeatedly ask permission for ordinary authorized fixes. Use browser automation only when it is needed. When it is needed, use the provided CUA tooling, never an independent Playwright/CDP driver. Temporary visual fixtures must be removed before shipping. Do not manufacture posts, DMs, invitations, paid runs, or reports on real accounts to test a UI.

## Stack and environments

The project uses React, TypeScript, Vite, Express, and MongoDB. **New Drugs does not use Convex.** Wayfinder's reactive behavior was a reference; New Drugs implements its own live-state delivery.

Node.js **22 or newer** and npm are required. The server bundle explicitly targets `node22`. Preserve that build target: targeting ES2023 previously stripped JSON import attributes needed by the TLD package and broke server startup.

| Port | Purpose | Owner/location |
| --- | --- | --- |
| 7330 | Main Vite frontend | Local machine; user starts and owns it |
| 7331 | Production API/app | Droplet loopback, behind HTTPS nginx |
| 7332 | MongoDB replica set | Droplet loopback; no local MongoDB |
| 7333 | Cloud dev API/MCP | Droplet loopback, behind HTTPS nginx |
| 7334 | Separate admin Vite frontend | Local machine; user starts and owns it |
| 7335 | Existing convention for a test MongoDB SSH tunnel | Local forwarding to droplet 7332, not a local database |

Production and dev share the DigitalOcean droplet at `24.144.121.19`, with separate service instances, databases, environment files, and runtime state. MongoDB is a replica set because wallet, receipts, indexing jobs, and other state transitions rely on transactions.

Cloud dev has **no public frontend**. The user uses the local browser frontend. Vite proxies `/api` to the HTTPS cloud dev API and injects `X-NewDrugs-Dev-Key` on the server side. Never put this key in client code. CLI and hosted MCP use their own bearer credentials; an Authorization header passing the dev gate is not a substitute for actual authentication.

The hosted OpenAI service needs a reachable HTTPS MCP endpoint. Do not replace this workflow with a local API/database that the hosted agent cannot reach.

Configuration locations:

- `.env.cloud-dev`: local Vite proxy configuration; private and ignored.
- `.env.cloud-test`: isolated cloud test database configuration; private and ignored.
- `/etc/newdrugs/dev.env` and `/etc/newdrugs/prod.env`: cloud service environment files.
- `server/config.ts`: validated runtime configuration and defaults.
- `vite.config.ts`, `admin/vite.config.ts`: ports, proxy behavior, and separate Vite caches.
- `scripts/nginx.conf`, `scripts/provision-host.sh`, `scripts/configure-host.sh`: infrastructure templates. Inspect the live host before assuming templates describe every deployed detail.

Do not print environment files, private key contents, CLI tokens, provider keys, payment secrets, or raw private audit data. Preserve existing stage-specific secrets and persistent runtime data across deployments.

## Local development

The user starts their frontend:

```sh
npm run dev:web
```

If needed, the separate admin frontend is started by the user with:

```sh
npm run dev:admin
```

**Do not start, stop, or restart the user's local servers.** If 7330 is occupied, inspect the process and explain the conflict; do not kill it or launch a second Vite. `npm run dev` starts both local frontends and an automatic cloud deployment watcher. It is not a harmless backend-only command. Do not launch it behind the user's back.

There is no local API or MongoDB to create. Backend and shared-operation changes need a cloud dev deployment for the local UI and hosted MCP to use them. Keep dev current after targeted validation, rather than waiting for a large batch of unrelated work.

Vite uses `node_modules/.vite-web`; admin uses `.vite-admin`. An outdated optimized-dependency 504 is a frontend cache problem, not a reason to start another backend. Coordinate a user-owned Vite restart if required.

## Build, deploy, and recovery

```sh
npm run check
npm run build
npm run deploy:dev
```

Only after an explicit production request:

```sh
npm run deploy:prod
```

“Deploy,” “send,” and ordinary feature work mean **dev** unless the user explicitly says production. Do not carry a completed production approval indefinitely into new tasks. Steering and corrections within an authorized in-flight release belong to that release.

Deployment behavior in [scripts/deploy.mjs](../scripts/deploy.mjs):

1. Acquire `.data/deploy.lock`; do not delete a live lock just because a deployment is slow.
2. Apply release retention, prepare version metadata, type-check, and build web, admin, server, and downloadable CLI.
3. Upload a release archive to `/srv/newdrugs/<stage>/releases/<timestamp>`.
4. Install production dependencies remotely.
5. Atomically switch `current`, record `previous`, and restart only the selected systemd instance.
6. Check the database-backed `/api/health`. If activation fails, restore the previous release and restart it.
7. Retain three releases while protecting the current/previous deployment targets.

Do not change application source during a build/deployment snapshot. Finish and validate changes first. Inspect the final exit status and health result, not just “build succeeded.” A few connection-refused lines immediately after restart are expected while the service starts; a final failed health check is not.

Remote dependency installation generally takes around a minute. Long tool waits must not prevent useful progress updates. A failed deployment can leave locally prepared version metadata ahead of the live service; inspect `release.json`, deployment logs, and live release paths before retrying. Do not blindly bump again or claim the new version is live.

Version policy:

- `release.json` is the public version source. The npm package's `0.1.0` is not the displayed application version.
- Dev builds/deploys do not bump the public version.
- An authorized production deploy increments patch. If the configured CLI/MCP operation-file hash changed, it increments minor, resets patch, then increments patch.
- `scripts/version.mjs` defines the hash inputs. These include shared navigation/catalog files, so a metadata change can also trigger a minor increment.
- `operation-build.json` identifies the current draft build. Per-operation semantic review revisions in `shared/operationContract.ts` are separate from the public version. Do not invalidate compatible successful receipts or reviews just because the release number changed.

The known SSH entry point is:

```sh
ssh -i /Users/work/.ssh/newdrugs_do \
  -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes \
  root@24.144.121.19
```

Useful read-only checks on the host:

```sh
readlink /srv/newdrugs/dev/current
readlink /srv/newdrugs/prod/current
systemctl is-active newdrugs@dev newdrugs@prod
curl -fsS http://127.0.0.1:7333/api/health
curl -fsS http://127.0.0.1:7331/api/health
journalctl -u newdrugs@dev -n 80 --no-pager
```

Do not paste unredacted private content from logs. Public production health is `https://druggie.org/api/health`; dev HTTP requests can be intentionally rejected by the gate. For frontend releases, compare the served HTML/assets with the built release in addition to checking the API. Do not switch another stage's symlink or restart the wrong service while recovering a failed release.

## Code map

| Area | Start here |
| --- | --- |
| Application shell, modes, settings, chat, workspace preservation | `src/App.tsx`, `src/SocialExperience.tsx`, `src/ExperienceContext.tsx` |
| Primary URLs, natural modes, exact links | `shared/navigation.ts`, `shared/experience.ts`, `src/usePrimaryRoute.ts`, `server/resourceLinks.ts` |
| Mounted panel state and navigation ancestors | `src/PreservedPanels.tsx`, `src/panelHistory.ts`, `src/ComposerPanel.tsx` |
| Chat history, following, animation, streaming text | `src/useChatHistory.ts`, `src/useConversationScroll.ts`, `src/ChatHistory.tsx`, `src/AgentLiveMessage.tsx`, `src/useProgressiveText.ts`, `src/useMessagePlacement.ts` |
| Mobile keyboard and desktop positioning | `src/useMobileInputFocus.ts`, `src/useChatPosition.ts`, `src/chatPosition.ts`, `src/useAgentDockGeometry.ts` |
| Deletion review UI | `src/DeleteConfirmation.tsx`, `tests/deleteConfirmation.test.ts` |
| Scrolling and menu bounds | `src/usePageChatScroll.ts`, `src/panelHeaderScroll.ts`, `src/useEdgeAwareMenu.ts` |
| Posts, replies, draft author row | `src/PostPanels.tsx`, `src/PostPhotos.tsx` |
| Profiles, invites, DMs, safety | `src/PersonPanel.tsx`, `src/ProfileCard.tsx`, `src/NativePanels.tsx`, `src/PeopleSafety.tsx` |
| Visual tokens and layouts | `src/style.css`, `src/modes.css`, `src/Atmosphere.tsx` |
| Link rendering, previews, embeds, image viewer | `shared/links.ts`, `shared/postLinks.ts`, `src/LinkPreview.tsx`, `src/CustomMedia.tsx`, `src/AudioPlayer.tsx`, `src/ImageViewer.tsx`, `server/linkPreviews.ts`, `server/publicFetch.ts` |
| HTTP, sessions, identity, account changes | `server/app.ts`, `server/auth.ts`, `server/account.ts`, `server/devGate.ts` |
| Canonical operations, validation, execution | `shared/catalog.ts`, `shared/contracts.ts`, `shared/operationContract.ts`, `server/operations.ts` |
| Hosted agent and durable worker | `server/agent.ts`, `server/runTypes.ts`, `server/agentDraft.ts`, `server/sessionContext.ts`, `server/reviewReply.ts`, `server/bufferedEvents.ts` |
| Shared agent behavior | `shared/agentEthos.ts`, `shared/agentWriting.ts`, `shared/agentDiscovery.ts`, `shared/agentSetup.ts` |
| CLI and MCP | `cli/index.ts`, `cli/config.ts`, `cli/lifecycle.ts`, `cli/search.ts`, `server/mcp.ts`, `server/operationSearch.ts` |
| Live state | `server/liveState.ts`, `server/privateState.ts`, `src/useLiveState.ts`, `src/useRecordRefresh.ts` |
| Public semantic search | `server/search/`, `shared/search.ts` |
| Private chat search | `server/search/chat.ts`, `shared/chatSearch.ts`, `src/ChatSearchPanel.tsx` |
| Automations, inbox, sleep | `server/automations.ts`, `server/automationSchedule.ts`, `server/backgroundAuthority.ts`, `server/automationNotices.ts`, `server/inbox.ts`, `server/sleep.ts`, `src/AutomationsPanel.tsx`, `src/InboxPanel.tsx` |
| Credits, payments, onboarding | `server/wallet.ts`, `server/payments.ts`, `server/starterPool.ts`, `server/onboarding.ts`, `shared/paymentQuote.ts` |
| Storage, locations, push | `server/uploads.ts`, `server/locations.ts`, `shared/geo.ts`, `server/push.ts`, `public/sw.js` |
| Separate administration | `admin/`, `admin/Users.tsx`, `server/admin.ts`, `server/adminUsers.ts`, `server/adminCli.ts`, `server/moderation.ts` |

`server/index.ts` starts database setup, the agent worker, public/private search workers, push delivery, and upload cleanup. The durable agent worker is in `server/agent.ts`; there is no separate `runWorker.ts` file.

## UI behavior to preserve

### Modes and navigation

The primary order is **Agent, Posts, Friends**. Each mode retains its own page stack, agent subpanel open/closed state, draft, attachments, and scroll. Switching modes restores that mode. Re-selecting the active primary mode returns it to its base. Sidebar section buttons also return to their named base, rather than treating a directly opened record as the section's home.

Posts and Friends have the same main-column width. On wide screens the secondary Agent uses the remaining right side within bounds. The Agent-mode launcher can sit to the left of chat; it only pushes chat right when necessary to fit. Desktop chat is now pinned to the visible bottom and draggable horizontally only. Old saved vertical positions are ignored. Mobile is bottom-pinned and never draggable.

Primary panel URLs choose the natural mode unless an explicit alternate-mode prefix is needed:

| Destination | Natural URL | Example in another mode |
| --- | --- | --- |
| Agent chat | `/` | Secondary chat does not replace a social panel URL |
| Posts feed / composer | `/feed`, `/compose` | `/agent/feed` |
| Post | `/posts/:id` | `/friends/posts/:id` |
| People / person | `/nearby`, `/people/:id` | `/posts/people/:id` |
| DMs | `/messages/:connectionId` | `/posts/messages/:connectionId` |
| Agent inbox / automation | `/inbox/:id`, `/automations/:id` | `/posts/inbox/:id` |
| Chat search | `/chat-history` | `/friends/chat-history` |

“Chat search” is the UI label. The compatible route and internal `chat_history` identifier have not been renamed. Search/filter state belongs in query parameters. Browser Back/Forward restores views and filters without pushing a duplicate entry. Keep ancestors/visited views mounted for drafts and scroll; a copied URL does not contain an unsent draft.

Settings overlays preserve the underlying panel. Inbox, Automations, and Chat search may be browsed in the current social mode. Actual chat handoffs use the side chat on desktop and switch to Agent on mobile, carrying the payload after the target workspace is restored. Prefer returned exact resource links; never fabricate IDs or confuse human Messages with Connected agents.

### Visual and interaction details

- Noto Sans, Serif, and Mono; Phosphor icons. Search `npm run icons -- <terms>` or `docs/phosphor-icons.json`. Do not guess Lucide export names.
- Buttons and button-like controls disable text selection, including the Safari-prefixed property. Ordinary message text and editable fields remain selectable.
- Extensive CSS variables. No decorative underline offsets/thickness, routine outlines, scrollbars, excessive nesting/padding, or extra trailing list separators.
- The page/install icon is the dimensional blue orb. The interactive mic is flat black. Its icon hides while typing; the circle does not fade. Dictation splits into flat red Cancel and green Send.
- The secondary Agent footer places the mic immediately left of Close; both circles are 40px. Its redundant launcher/control row is absent. Keep shared size/radius variables consistent.
- Assistant messages are black; user messages are blue with 12px text and compact padding. Long messages have Show more. AI chat and DMs have a floating circular down-arrow when scrolled away from the latest messages.
- DM history includes the original invitation from connection data, not a duplicate inserted message. The DM scroller has a 1px top boundary. Sending clears the composer immediately and uses the message transition.
- The top-right New post button is black while the composer is active, on desktop and mobile.
- Profile names and usernames sit on the same baseline, name first, wrapping if needed. They share a font size while retaining their different weight/color treatment. Apply size consistency to post headers, the post editor, and People results too.
- Open messages is followed by a rounded-rectangle three-dot button of matching height. It contains Unfriend, Block, and Report, retaining reviews/forms before submission. The menu is positioned within the viewport and every clipping panel ancestor; it shifts horizontally, flips above, and scrolls internally when space is short. Reuse `useEdgeAwareMenu` instead of fixed dropdown offsets.
- The draft author row has no extra 4px inner padding. The post card's own padding remains separate. Avatar images and missing-photo icons share sizing rules.
- Tapping empty panel-header space or its title scrolls that panel to the top. Header controls keep their actions. There is no document/body “ghost scroller” for the iOS status bar.

### Mobile, PWA, and overlays

All mobile inputs are at least 16px. Preserve pinch zoom. Keyboard layout uses `visualViewport.offsetTop + height`, applies before paint, removes the bottom safe-area inset while the keyboard is open, and hides generic panel headers/settings as designed. Do not reintroduce `scrollIntoView` or focus behavior that pans the whole iOS page.

Normal mobile exterior spacing is 6px with safe-area protection. Installed mobile Posts/Friends fill to the side and bottom edges beneath top controls. The tri-switch is always icon-only with its backing on mobile. The optional floating Agent button is hidden on mobile and whenever it overlaps main content. Mobile has no generic panel footer.

The PWA has a manifest, blue-orb icons, black theme/body/browser-chrome treatment, and link preview metadata using the user's branding. The service worker supports push, not offline app caching. iPhone behavior has browser/geometry tests, but desktop emulation is not proof of physical-device keyboard or multitouch behavior.

## Agent, operations, and reactivity

The hosted agent uses the OpenAI-hosted Agents API and a public MCP connection, not a locally owned Agents SDK execution loop. The configured model in source is `gpt-6-luna`, medium reasoning. Inspect the current SDK, source, and applicable API docs before changing provider behavior; do not assume another API has the same lifecycle.

Hosted runs are durable. The host persists run state, tool decisions, review contents, provider/session context, and usage. Shared instructions and schemas contribute to the agent specification identity; changes must reconcile or replace provider context rather than leaving an old chat permanently on stale instructions. Respect the existing bounded context import/session cleanup path.

Streaming must work from provider events through durable state and `/api/events` into React. Do not substitute “one moment,” flickering placeholders, or repeatedly restarting fake text. Completed final output appears immediately. Wallet and record changes should refresh through the shared live-state path, not a collection of arbitrary polling timers. Technical errors should not shift the input layout.

The operation catalog is the common contract for UI/CLI/MCP. A feature that changes domain behavior needs validation, authorization, idempotency, exact links, and appropriate reactive invalidation. Utility operations can remain agent/CLI/MCP-only. Add direct UI when it makes sense for the user workflow, not mechanically for every helper; core social actions still need usable manual controls.

Keep these four things distinct:

1. **Operation discovery:** `newdrugs search` / `newdrugs_search` finds capabilities by their descriptions.
2. **App navigation:** opening People nearby does not require a semantic query for the phrase “people nearby.”
3. **Content retrieval:** `people.search`, `posts.search`, and `search.*` match meaning in saved content, with structured geographic/author/date filters.
4. **External web research:** uses actual web search for places, events, current facts, and activity ideas.

When asked to explore posts, the shared discovery guidance calls for a curated selection informed by relevant current profile/activity context and actual candidate posts. It does not hardcode topics or map a phrase to a search query. Display the chosen IDs through `post_list` in the main panel. The chat handoff is a brief introduction plus the returned selection link, without quoting, summarizing, paraphrasing, or revealing individual post contents before the user reads the cards. Explicit requests to open the feed remain navigation.

Read the exact operation schema before calling it. Use one idempotency key per individual write and reuse it only for the identical retry. No bulk action APIs: Confirm all/Reject all groups independent actions in the review UI. Serious writes require exact review; requested DMs in accepted connections send directly. A typed chat reply during pending review rejects those pending writes and continues with the user's text; it is not approval. An `ok:false` tool result is not a completed action.

## Search, privacy, and locations

Public search indexes discoverable human profiles, public posts, and replies using persisted 512-dimensional vectors plus lexical relevance, filtered retrieval, and source hydration. MongoDB is the source of truth; the native HNSW index is derived/rebuildable state. Pending/failed indexing and keyword fallback must be explicit. Do not add hardcoded phrase routes to fake semantic quality.

Public results must re-check current blocks, visibility, deletion, and source content. DMs, private chats, private files, and inferred sensitive traits do not belong in public search. Private agent-chat search is a separate owner-only index using `conversation.search` and `conversation.window`. Clicking a result loads its surrounding context and scrolls to it without overwriting the live draft.

Search embeddings are platform-funded, not debited from user chat credit. Consult configured indexing/budget limits before increasing corpus capacity. Linked article contents and rich media are not automatically semantically indexed just because their attachment previews render. Multimodal/attachment-content retrieval remains future work.

Locations use H3 resolution 5 and fixed coarse area centers, roughly ten miles apart. Precise device coordinates are rounded on the device; store/query the coarse center. Radius and distance compare shared areas. Never describe a same-area match as physically zero miles away or at the user's address. Posts' tagged areas are not proof of their authors' current locations. Country display uses US; US states abbreviate only on mobile; omit the generated word “area” in displayed labels.

## Automations, account activity, and inbox

New automations are created **active through one confirmed `automations.create` operation**, with the next scheduled run. Do not bring back the old save-paused-then-enable creation flow. Editing a definition still pauses it for a separate reviewed enable. Creation does not immediately run or charge it.

Automation examples auto-send to the primary agent and preserve the existing draft. Schedules use an IANA timezone with DST-aware calculation. Instructions preserve the user's original request and constraints. Read changing interests, profile tags, location, and account facts at run time rather than baking them into saved prose. The worldwide friend example is deliberate while the user base is small.

Background agents have separate sessions and run-bound read authority. Social account activity, private agent chat, and web access are separate scopes. They deliver an explicit result to the private Agent inbox or finish silently; they do not impersonate the user's primary chat or send social messages. Keep budgets, credit holds, revision/generation fences, credential revocation, and observable deferrals/failures intact.

Sleep persists the pending function call and releases active execution until wake. It is not a busy wait or a model repeatedly checking the clock. Pausing/revoking/cancelling must fence stale work. External `inbox.publish` uses the authenticated producer identity, is idempotent, and does not start hosted reasoning.

## Accounts, money, storage, and administration

Accounts use stable internal IDs, not mutable handles. Guests are funneled into creating an account before protected activities; profile setup follows account creation. Account settings handles username/password changes and explicit chat clearing. There is no email recovery project.

Eligible accounts receive $1 from a shared starter pool initialized at $100. Eligibility is limited by public IPv4 or IPv6 /64 using a keyed fingerprint across stages; guests can see eligible credit without receiving spendable funds. Existing balances are preserved. The pool can be increased through administration. Removing the dollar sentence from onboarding did not remove this funding mechanism.

Wallet values are integer nanos. The UI rounds displayed credit **up** to cents consistently. Billing itemizes credit and expected processing fee so the full selected amount becomes credit. Preserve existing reconciliation behavior; do not redesign provider-cost settlement as incidental cleanup.

Storage is 64 MB per account, with a 12 MB upload limit. Images are oriented/downscaled to a 512px shorter side without upscaling and encoded for storage. Profile photo deletion must remove its storage allocation appropriately. Photos are displayed square on profiles; post media shows the full image with bounded dimensions. Posts support 280-character text, up to four photos, and three URL attachments.

Rich previews include ordinary links, providers, and custom MUSE/POPS/CIF formats. Keep the shared audio player, no download menu/source links for restricted custom formats, stable loading geometry, proper image viewer pan/zoom, and scroll propagation. URL labels omit scheme/`www.`; `linkify-it` and the TLD catalog recognize bare domains beyond `.com`.

Admin is a separate frontend under `admin/` with separate authentication and trusted first-owner setup. Moderation/report operations use separately scoped operator CLI credentials. Do not add a moderation frontend or mix owner controls into the ordinary profile/settings flow without a new request.

The production admin entry is `/admin/`. For first-owner setup, the user runs `npm run dev:admin`, opens `http://localhost:7334/admin/`, and creates credentials through the trusted dev proxy. The owner is stored in the shared platform database, so the same credentials then work on production. Do not remove the first-owner gate to make public setup easier.

Admin static routing is in `server/adminFrontend.ts`. Match the bare `/admin` redirect with an anchored regular expression: a normal Express string route also matches `/admin/` and caused a redirect-to-itself loop. `tests/adminFrontend.test.ts` covers the single redirect, canonical/deep admin URLs, assets, and the unaffected public root. The live admin HTML and script returned HTTP 200 after v0.18.3.

## CLI and credentials

Use the installed CLI or the built source CLI; MCP installation is optional. This machine has used named `default` (production) and `dev` connections. Verify available profiles instead of assuming tokens remain valid:

```sh
newdrugs profiles
newdrugs --profile dev search "read direct messages"
newdrugs --profile dev describe messages.list
newdrugs --profile dev describe identity.get
newdrugs --profile dev read identity.get
```

Discover and describe operations before use. Do not perform real writes merely to verify connection health. Explicit `--profile` is safer than changing the globally active connection during development. Ordinary users default to the public site without dev/prod jargon.

Credentials live in the private config store, normally `~/.config/newdrugs/config.json`; operator credentials are separate in `admin.json`. Never dump these files. Login tokens go through `--token-stdin`, not command arguments, shell history, docs, screenshots, or replies. Reuse the user's existing connection; do not ask for or expose keys unnecessarily.

Installed CLI copies check daily for a strictly newer published version. `newdrugs update` checks immediately. Source checkouts do not self-overwrite. For controlled source verification after a build:

```sh
NEWDRUGS_DISABLE_AUTO_UPDATE=1 node dist/cli/index.js --profile dev describe people.search
```

`newdrugs uninstall --yes` removes the installed CLI, standard MCP registrations, and saved local logins when the user requests removal. It does not delete their website account. Public `llms.txt`/agent instructions cannot create network or tool abilities that ordinary ChatGPT does not have; do not promise plugin-free authenticated operation from documentation alone.

## Testing and evidence

`npm run check` is TypeScript checking. `npm run build` also builds every shipped artifact. Use the relevant existing tests; do not create brittle tests for a trivial padding or copy edit.

Examples for substantial navigation/UI changes:

```sh
npx vitest run tests/appInteractions.test.ts tests/navigation.test.ts tests/mobileKeyboard.test.ts
npx vitest run tests/profileActions.test.ts tests/edgeAwareMenu.test.ts tests/profileEditor.test.ts
npx vitest run tests/dmInvitation.test.ts tests/conversationScroll.test.ts tests/pageChatScroll.test.ts
```

Backend tests connect through `.env.cloud-test` to **`newdrugs_test` only**. Tests can delete that isolated database's fixtures. Never point them at `newdrugs_dev` or `newdrugs_prod`, or remove their database-name guards. `vitest.config.ts` also overrides the shared starter pool to the test database, disables real Stripe/push credentials, and sets `fileParallelism:false`. Do not run separate database test processes concurrently against that shared test database.

If the test URI uses localhost port 7335, it is an SSH tunnel to the cloud MongoDB. Check for an existing listener before opening another. A tunnel can be established with the known deployment identity, if needed:

```sh
ssh -N -L 127.0.0.1:7335:127.0.0.1:7332 \
  -i /Users/work/.ssh/newdrugs_do \
  -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes \
  root@24.144.121.19
```

This is not permission to start local MongoDB or replace test connection configuration. Use the existing private test credentials without exposing them.

Validation at handoff:

- Earlier full regression: 282 tests across 49 files, before the later UI/routing changes. Do not describe that as a fresh full-suite result for v0.17.3.
- Later targeted runs covered routing/history, independent mode state, mobile keyboard behavior, horizontal-only dragging, DM history/latest controls, profile actions, and menu placement.
- The profile/menu pass ran 70 tests across five files successfully. The final 4px padding patch passed type/build/deploy checks.
- A temporary browser fixture using the actual hook and styles verified a 320px-wide clipped panel: the menu shifted left, opened above, flipped below when scrolled, and remained inside the panel. The two action buttons measured the same 44px height. The fixture/tab were removed.
- Production v0.17.3 HTML matched the built release and the public database-backed health endpoint returned `ok:true`. Both stage services were checked again for this handoff.

## Documentation and known limits

Useful deeper references:

- [Wayfinder source map](wayfinder-study/source-map.md) and [transfer study](wayfinder-study/transfer.md)
- [Pangaea study](pangaea-study.md)
- [Primary panel routes](three-mode-experiment/panel-routes.md)
- [URL attachments](three-mode-experiment/url-attachments.md) and [post media](post-media.md)
- [Public semantic implementation](semantic-search-implementation.md), [private chat search](private-chat-search.md), and [search research](semantic-search-plan.md)
- [Automations and inbox](automations-and-inbox.md), [starter/push/operator notes](starter-push-operator.md)
- [CLI production audit](reviews/2026-09-26-cli-production-audit.md) and [audit fixes](reviews/2026-09-26-cli-audit-fixes.md)
- [Roadmaps](roadmaps/README.md), which are options and research rather than blanket approval to build everything

Known stale statements in older documents include saved people, save-paused automation creation, the old Chat history label, restoring a saved browsing mode for bare deep links, a 48px secondary mic, vertical desktop dragging, and earlier mobile gutters. Some public-search docs predate private chat indexing and the current All/Nearby/Friends/Saved post filters. Use the current source and this guide for those decisions.

There is no promise of physical-iPhone coverage, large-corpus search capacity, exhaustive UI/CLI parity for every future addition, or authenticated ordinary-ChatGPT access from `llms.txt` alone. The feature set is real and deployed, but those claims require their own evidence. Raw operator-audit artifacts under ignored `.data/research/` may contain private information and must not be committed.

## Starting the next session

1. Read this guide and AGENTS.md, then inspect `git status`, the branch, and `release.json`. Preserve ongoing work after the pre-Log checkpoint.
2. Read the actual files for the requested surface/operation and the relevant read-only reference app. Check old documentation against current code.
3. Keep user-owned local servers running as they are. Use the cloud dev backend and explicit CLI profiles.
4. Implement a complete, bounded change with the necessary manual UI, agent contract, authorization, links, and live updates. Avoid unrelated redesigns or deferred projects.
5. Validate appropriately, deploy dev promptly, and only deploy production when explicitly requested. Report what is actually live and any real limitation.
6. Update this guide's snapshot and relevant behavior notes after material changes so the next handoff does not depend on a conversation transcript.

## Log experiment (current dev work)

Read [the Log integration plan](log-integration/PLAN.md) and [parity decisions](log-integration/PARITY.md). Production remains v0.19.1; Log is dev-only until explicitly approved. Branch `experiment/log` starts from checkpoint tag `pre-log-v0.19.1`. The new fourth tab reuses `SocialExperience`, existing mode state, mobile behavior and main-panel navigation. Core source is `shared/log.ts`, `server/log.ts`, `src/LogPanel.tsx`, and `src/log.css`.

Log is private or explicitly shared, never a public post dataset. Accounts/friends/auth stay canonical. Shared invitations require an accepted friendship and exact review; each person owns their own contribution. Writes carry current entry revisions and ordinary idempotency keys. The `logAccess` background grant is separate from `accountActivity` and `privateChat`, defaults false for old records, and allows reads only.

Media uses the existing quota and file service with `log_media` purpose. `newdrugs file-upload <path> --log` uploads media through the CLI; source/dev builds expose this before a versioned prod CLI release. HTTP range responses recheck authorization. Deleting files removes Log references and updates revisions; detaching a file keeps it manageable in Storage. `log.list` returns bounded note previews; `log.get` and paginated `log.export` return full text.

The Log source project `../logcal` is read-only, like the other references. Do not copy its JWT accounts, friend graph, exact GPS behavior, native configuration or anonymous share keys. The parity map documents adaptations and intentional omissions.

Log completion evidence: dev release `20260926233414675`, with production unchanged at `20260926221734638`. Both health endpoints returned `ok:true`. The dev catalog exposes all 15 `log.*` operations, and live read-only CLI checks succeeded. The Log/push regression passed 101 tests; subsequent navigation/draft checks passed 71, plus focused backend tests for attachment order and stale revisions. Counts overlap across suites. Mobile UI was reviewed at 390px and 320px using disposable fixtures; no personal Log entries were created for QA. The code is checkpointed on `experiment/log`; see `git log` for the final implementation commit.

The first Log UI was corrected after the user clarified “New Drugs skin, Logcal bones.” Keep the reference calendar’s continuous backward weeks, flat square mosaics and four-wide contact sheet. Do not reintroduce month-by-month paging as the main experience. `src/LogCalendar.tsx` owns progressive calendar loading; `src/logCalendarModel.ts` defines adjacent year chunks. Day tiles open one entry or a chooser, and empty days create a dated draft. Photos lead entry details and editor media comes first. New Drugs fonts, palette, controls and native routing remain in use.

UI correction deployed to cloud dev as `20260927003706998`. Production remains unchanged. The correction keeps New Drugs styling and restores Logcal’s continuous calendar, square mosaics, four-wide contact sheet, Today strip, photo-first details, media-first editor, and bottom entry actions.
