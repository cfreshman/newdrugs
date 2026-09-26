we are building "New Drugs" made in new england at druggie.org

Current operating guide and handoff. Read this before working on the project:

@docs/OPERATING_GUIDE.md

we are on a computer with a project called 'Wayfinder OS' already built

the goal is to adapt what we've learned building Wayfinder into a social media app which actively makes your life better by connecting you to people around you and generally letting you work with an agent who does whatever you want socially in this app

the UI will start as a single circle (for dictation / dragging) with a textarea above it. messages appear above that. make the background simply a really cool radial gradient composition

the user tops up credits, communicates with the agent, and thats it for now. later we'll build more and more UI that the user can progressively discover

now, the agents will have full CLI/MCP orchestration of the site. the site will allow you to connect externally from e.g. Codex via CLI/MCP. usage is free in that case. it is a net-zero app: the users pay exactly for their costs and no more

ultimately the goal is a cross between twitter and bumble bff

eventually there will be a mobile app too but web only is fine to start

avoid LLM slop. prefer simple HTML-looking things (although still styled nicely). avoid eyebrows, too much text, etc. that doesnt mean the things LLMs like to add to the UI are banned, but it should look like a human made it

i am not sure what infrastructure decisions to make. please help me choose. i typically deploy straight to a single digitalocean host with mongodb. i usually use vite MERN

ok - go

addendum

- users should be able to edit a profile just like bumble bff. the AI does not edit the profile. the user must set the text and images. this is to avoid LLM slop / uncreativity. its a concern for the platform - this ethos will continue to be used, the difference between AI being used correctly and AI slop

- you should use Phosphor Icons

- oh - use Noto fonts. sans, serif, mono. from google fonts

- use css variables extensively

- avoid css outline setting, disable if possible, only manually add intentionally

- mobile is the primary interaction surface


agent-written rules (you are allowed to edit below this line)

- the agent must not compose em dashes, in either its own replies or text sent through operations. Preserve verbatim human-supplied text. When composing messages/posts/invitations on a person's behalf, match their actual communication style from their own writing, preserving intent and avoiding invented facts or feelings. Keep this policy shared across hosted instructions, MCP and CLI setup. Profiles remain human-authored.

- before building any new feature, inspect the relevant current code in the reference app: `../wayfinder` for agent behavior, MCP/CLI, confirmations, uploads, durable runs, and billing; `../pangaea` for social interactions, feeds, profiles, navigation, and UI. trace the relevant flow and read its tests where useful. do not implement from assumptions when the reference code is available.

- New Drugs is a different product, but the user explicitly wants as much of Wayfinder's CLI/MCP/agent implementation and behavior carried over as makes sense here. Use it as the implementation source for the control plane and agent, adapting to New Drugs and the hosted Agents API. Do not transplant its business domain or UI. Do not edit either reference app, run their test suites, restart them, or deploy them as part of work here. Implementation and validation belong in New Drugs.

- chat is the usual home. users can trigger task-specific UIs and return to the same chat with their context preserved.

- avoid browser automation unless strictly necessary.

- the product name is styled "New Drugs".

- the page/install icon is the original dimensional blue orb. The interactive mic button is flat black; only its icon disappears while typing or while an inline panel occupies the input. Never fade or pulse the circle’s opacity. dictation splits into close, flat red cancel and green send circles; no rings, shadows or connecting bridge. user chat bubbles are blue.

- mobile is the primary interaction surface. design for mobile first. keep chat within horizontal viewport limits. user message text is 12px with 6px by 10px padding; agent message text is 14px. use 1px control borders, not 2px. no literal connecting bridge behind dictation buttons.
- mobile chat is fixed at its lowest allowed position; no dragging or saved desktop position. Hide the app version on mobile. Desktop stays pinned to the visible bottom too, allowing horizontal dragging only. Ignore old saved vertical positions.
- the launcher sits below the input on the left, top-aligned with the mic on the right. Clicking it transforms the input into an inline panel with a snappy real height animation and content fade. Every launcher child uses this same input space, never a modal. Clicking the launcher again restores the draft. Hide dictation and disable chat input while launcher screens are open, preserving the controls' space. Manual people, posts, invitations, DMs and blocking must work without the agent. On desktop the launcher menu fits its content; on mobile and touch tablets every launcher view, including the menu, uses the full available height below Settings. Selecting any child expands the input panel to a 12px/safe-area gap at the top. No shrink debounce is needed because child panels keep a stable extent; Desktop shows Back and the title in both a pinned header and footer. Mobile has no footer, and hides the header while the keyboard is open; content uses the remaining space. Both launcher and mic support desktop dragging, open or closed; mobile stays fixed. Settings overlays and preserves the mounted launcher. Notifications belong in Settings and the top-right bell. Launcher and Settings option rows share a single treatment. On wide screens, launcher panels open beside chat, which remains usable; only move chat right if the panel would otherwise cross the left viewport edge. Closing the launcher preserves its mounted view/drafts/scroll. Reset returns to launcher options. The mic circle remains black; hide only its icon while typing or while the input is occupied by a narrow panel. Do not duplicate My profile in the launcher. Use cards, buttons, pills and pill-track tabs for actions; no custom underline offsets or thickness, and no trailing list separators. Storage is 64 MB per account; images use a 512px shorter side without upscaling and users can delete files in Settings. Autofocus the chat input on initial load and after launcher/settings close.
- desktop chat is 600px wide (25% wider than the original 480px), still bounded by the viewport gutters. Mobile uses the available width.

- no top page gap around the conversation. use all seven rainbow colors in an overlapping radial gradient composition with varied centers and sizes; do not arrange them in spectrum order or rainbow bands. keep a warm field behind the blue orb and user bubbles for contrast.

- agent bubbles are black with white text; user bubbles are blue.

- do not put errors or status text between the input and mic or let them move the controls. log technical failures. show user-actionable failures in the conversation.

- the regular input send button is black. do not brighten or dim the mic, dictation buttons or send button on hover, press, focus or disabled states.

- the chat input has no border. retain its rounded corners and no placeholder.

- a fixed Phosphor gear control in the top-right opens base settings, profile, billing, and external-agent connections. Desktop modals open from that corner with the X aligned to the gear; mobile modals stay centered.

- the settings circle is white glass. nested settings screens have a back arrow immediately left of the X. backdrop dismissal happens on outside pointer-down only, never pointer-up/click, so text selection does not close the modal.

- admin is a separate frontend under `admin/`, with its own sign-in. first setup creates the sole owner, using the trusted dev connection to prevent someone else claiming it. the owner manages one shared $100 starter-credit pool across prod/dev; eligible saved accounts get $1 once while the pool has funds, limited to one new claim per public IPv4 address or IPv6 /64 using a shared keyed fingerprint. Guests only see the eligible dollar, without allocating it. Existing credit is preserved, and the budget can be raised later.

- show a small version left of the settings gear. dev edits/builds/deploys must NOT bump the displayed release. On an explicitly approved production release, increment patch; if CLI/MCP operations changed since the published release, increment minor once, reset patch, then apply the production patch increment. Draft contracts use their own content revision for approval binding.

- "deploy" always means cloud dev. Only deploy production when the user explicitly says "deploy prod". Generic requests to deploy/test or ongoing feature work never authorize production.

- the agent thinking/message UI must work the same way as Wayfinder's actual implementation. Read and carry over the relevant rendering components and state transitions; do not substitute a generic progress UI. Preserve New Drugs' specifically requested colors, type sizes and controls.

- no bulk/batch action APIs. use one tool call per individual operation. only the review UI groups pending individual actions into Confirm all / Reject all.
- direct messages in accepted connections send directly when requested, without an additional confirmation. Reserve review for serious actions such as invitations, publishing, irreversible deletion, and reports; never add a conversational approval before the app's review.

- show the credit balance inside the settings button, left of the gear, rounded up to the next cent. version remains separately to its left.
- billing leads with New Drugs taking no cut. Show the chosen credit, expected payment-processing fee, and checkout total as separate rows. Do not repeat a paragraph explaining those rows. State that external Codex / Claude Code / other CLI/MCP access is free from New Drugs' side.
- profile editing includes human-uploaded photos and a preview using the same renderer as public profiles. Use real geographic queries against coarse fixed grid points; never retain a person's precise GPS coordinates.
- fade the top of overflowing chat messages into the actual page background with a mask.

- use `npm run icons -- <search terms>` or `docs/phosphor-icons.json` to choose actual installed Phosphor exports. The catalog comes from official `@phosphor-icons/core` metadata and is verified against the React package. Do not guess icon names from other libraries.
- keep only the background visible until initial chat/settings data has loaded. Chat stays pinned to the visible bottom; desktop restores only its horizontal position.
- carry over Wayfinder's Show more / Show less behavior for long messages, including scroll anchoring and stable pointer/keyboard interactions. The send handoff uses a single moving object with inert copies of input and bubble crossfading inside it, retaining the bubble's corner shape.
- text should appear smoothly while a run is active, without restarting or disappearing between snapshots; completed messages show immediately. Prefer correct provider-to-browser event delivery over animation hiding stale state.
- scrolling the base page scrolls chat; native chat scrolling, modals, focused controls, pinch zoom and orb dragging retain their own interactions.

- development uses the cloud dev API, MongoDB and public MCP, with local Vite only on 7330. maintain and deploy the cloud dev backend as part of development. production is separate. use the OpenAI-hosted Agents API with its public HTTPS MCP connection, not a locally owned Agents SDK loop.

- the user starts and owns local dev servers. do not launch or restart local Vite/admin servers. provide the command and leave local ports free. continue maintaining cloud services and deploying cloud dev changes as needed. there is no local MongoDB or API server.

- Public semantic search combines persisted 512-dimensional vectors, lexical relevance and current source authorization. Nearby and All people are both available, in that order. Nearby is a strict coarse-area filter, not the only search scope. Do not index DMs, private chats, files or inferred profile traits into public discovery. External search is platform-funded, never deducted from user credit.
- The dev domain serves no public frontend. Local Vite injects the private development key; CLI and hosted MCP use their own bearer credentials. Never put that key in browser code.

- Agent-selected posts use the reusable PostList and a reopenable selection link. Keep navigation ancestors mounted so opening a post/reply and going Back preserves scroll, filters, pagination and drafts. Do not show a redundant Public reply label in the composer.
- Installed CLI releases follow Wayfinder's daily version check, strictly newer updates, preserved profiles, and explicit `uninstall --yes` cleanup. Never self-overwrite/uninstall a source checkout.

- On phones and touch tablets, anchor chat to `visualViewport.offsetTop + visualViewport.height`, not `innerHeight`; iOS standalone can resize and pan simultaneously when its keyboard opens. All mobile inputs, textareas and selects must be at least 16px to prevent focus zoom. Preserve pinch zoom. While the keyboard occupies the bottom of the screen, remove the bottom safe-area inset and retain only the normal gutter; restore the inset after dismissal. In that same keyboard-open state, shrink the mic and its control row to the launcher size, updating the positioning radius too so the recovered space belongs to chat. Detect keyboard shrink against the unobscured viewport, not only current innerHeight.
- Notification links to DMs/posts/people open the attached launcher panel, never a small Settings dialog. Preserve the prior launcher view and draft as a Back destination. Accepted DMs display the original invitation from the connection record as the first chronological bubble, without inserting a synthetic message or counting it as unread.
- Posts and replies accept up to four owned uploaded photos through the same UI/CLI/MCP operations. Feed queries must retain photo IDs. Display the complete image with its natural proportions, maximum container width and a bounded height, never a forced crop. Website links use cached safe same-origin previews.
- Sending a chat reply during review rejects pending writes atomically and continues with that exact reply; typed text never substitutes for Confirm. End the welcome with “Join X others on New Drugs.” using the real saved-account count, singular when appropriate, and no starter-dollar sentence. Keep the guest account-creation controls.

- Keep navigation, operation discovery, content retrieval and web search distinct. “People nearby” opens the unfiltered nearby people view. Semantic queries describe meaning in saved human-written content, such as easy weekend hikes, not UI labels or generic commands. Geographic/date/author limits use structured filters. Share this guidance across hosted prompts, MCP and external-agent setup.

- The donation settings item is labeled “Donate”, linking to the existing fuckingdonate.co page.

- Notifications retain recent read history with exact reopenable links and an explicit read state. Read items do not contribute to the badge. Opening an invitation marks it read without accepting it; keep resolved invitations in history and continue respecting blocks. Pending agent reviews remain actionable.

- On mobile keyboard opening, hide generic panel headers, Settings, and the DM user/video-call row; expand panels to a 12px/safe-area top gap. Restore headers after dismissal, but never show the mobile footer. Settings modals use 6px horizontal margins on narrow screens, preserving vertical margins. Use the same focus handling in mobile browser tabs and installed PWAs.
- AI chat and DMs load older messages at the top edge with a small spinner. Preserve the visible message when prepending, retain fetched history through live updates, and stop at the true beginning. Do not prefetch far ahead of the user.

- Navigating to a record already in the launcher stack, including a reply’s parent, pops back to the original entry instead of pushing a duplicate. Preserve its mounted state, scroll and draft. Keyboard/viewport resizes apply before paint and never run the launcher height animation.

- Onboarding counts saved accounts only, excluding the viewer. “Tweet” means a New Drugs post; do not append unsolicited X/Twitter limitations. Normalize speech-recognition whitespace for interim and final dictation alike.
- Operator report review uses separately scoped CLI keys and private local credentials, with schemas, exact confirmation, idempotency and audit. No additional moderation frontend. No email recovery.
- Web Push is opt-in from Notifications, for unread DMs and invitations. Home Screen installation is required on iOS. Keep subscriptions private and revoke them on logout; notifications never expose message text. Preserve persistent VAPID keys across releases. No offline service-worker caching.

- The launcher includes Chat search with a Phosphor Robot icon. User and assistant messages have a separate owner-only semantic index and shared `conversation.search` / `conversation.window` UI/CLI/MCP operations. Never include them in public discovery. Clicking a match loads and scrolls to its context window; live updates must not drag it back to latest. Preserve drafts/outbox and provide a floating circular down-arrow above the input whenever scrolled up. Search forms do not add another top margin inside panel padding.

- Non-primary-chat hosted agents and external CLI/MCP producers deliver into the private Agent inbox. Preserve producer identity, direct Markdown links, read/archive state and explicit discussion attachments. The first three launcher items (Agent inbox, Automations, Chat search) have a deliberate separator below them.
- Automation example prompts auto-send on click while preserving an existing draft and its attachments. They enter the ordinary chat/review flow; choosing an example does not itself enable recurring work. Include actionable morning context and a weekly friend-discovery example.
- Hosted automations use independent sessions, run-bound credentials, read-only data scopes and per-run credit holds. The main chat remains usable. Publish explicitly or finish silently. Pause/edit/revocation must fence out stale publications. Inbox push is separately opt-in.
- Sleep persists an unresolved function call until wake, with no AI execution while asleep. Provide wake/cancel controls. Continuing a sleeping primary chat supersedes its old run. Clearing chat must also clear searchable history and cached/provider context, cancel affected work, and reset open-tab history; credentials/username controls belong in a separate Account settings section.

- Shared base agent context must prioritize the person’s enjoyment, expression and intended connections. Never make likes, replies, reach, posting frequency or productivity the default goal. Quiet posts and simple captions are not problems to fix. General account-activity reviews do not authorize engagement coaching. Proactive advice needs a concrete benefit grounded in the person’s own interests or plans; otherwise stay quiet. Keep this consistent across primary chat, background agents and CLI/MCP.

- Automation instructions preserve the user’s original request and explicit constraints, adding only necessary missing direction. Never bake current profile tags/interests/location or other changing account facts into the saved instruction; read them fresh each run. Explicit user-requested topics remain fixed criteria. Keep schedule/permissions/budget in structured fields and shared behavior in base context, not repeated boilerplate in every prompt.

- Operation review versions describe each operation’s input/confirmation semantics, independently of release hashes and prose. Successful idempotency receipts survive compatible deployments. A real contract change renews the exact review rather than surfacing a generic drift error.
- Human connections use messages/connections destinations; external agent credentials use agents at /agents. Profiles include author-filtered Posts/Replies. Ending a connection retains its messages and original invitation; only the person who ended it can initiate reconnection, and only a declined invitation’s recipient can reconsider by inviting back.
- Automation credit/budget/service deferrals remain enabled, have an observable reason and retry time, and notify once per blocked occurrence. Genuine run failures notify separately from successful silence. Operator moderation stays in the scoped, confirmed, audited CLI; private-message evidence is limited to what the reporter explicitly submits.
- The user accepts the existing LLM usage-settlement behavior, including reconciliation against later credit. Backups remain deferred until the service has traction. Do not add either change as part of this operator-fix pass.

- The primary modes are Agent, Posts, Friends and Log. All three browser modes share main-column width; secondary agent fills available right-hand width within min/max bounds and covers the main content panel on mobile, preserving its gutters and the mode/settings controls above. Its Agent/X controls belong in a footer. Use shared orb-size/radius variables. The secondary Agent mic sits immediately left of Close in the footer; both are 40px circles. Secondary chat flows through the panel's top edge with no top fade or border gap, over a white-to-pale-blue background. Mobile mode switching is always icon-only; the switch uses the same backing tint and blur as Settings only while over content. Posts filters use accepted Friends, not Following; own posts belong in the profile.

- Display US country labels as US. Abbreviate US state names to postal codes only on mobile; desktop retains full state names. Preserve city names, non-US labels, and stored geographic data.

- Each primary mode owns its own agent subpanel open/closed state, draft, attachments, scroll and tool navigation. Switching modes restores the destination mode’s state, never copies the source tab’s state. Re-selecting the active mode still returns that mode to its base.

- Mobile browser content uses matching 6px exterior gutters, retaining safe-area insets. Installed mobile Friends/Posts reach the side and bottom edges beneath the top controls. The mobile agent subpanel covers the content-panel bounds.

- Deploy completed changes to cloud dev promptly after targeted validation, especially backend changes required by the local frontend. Do not defer dev updates until an entire larger experiment is finished. Production still requires an explicit request.

- Posts and replies support three separate URL attachments in addition to photos and a 280-character caption. Keep UI/CLI/MCP parity and exact-link review. Recognized providers and MUSE/POPS/CIF render natively; custom JSON and linked text are fetched through bounded public-URL validation, and inactive media stops playing.

- MUSE, CIF and POPS audio uses one shared compact native-style player: play/pause, elapsed time and scrubber, without volume controls or native/download menus. MUSE and CIF do not expose raw Source links. CIF reserves media geometry while loading; its media container radius is the outer card radius minus the card padding. Background scrolling in Friends/Posts targets the active main content and respects focused inputs, native subpanels and dialogs.

- Interior panel padding uses shared 12px desktop / 6px mobile insets, with 8px desktop / 6px mobile card padding. This density adjustment changes padding only, not DOM structure, gaps, margins or control sizes. Keep exterior gutters unchanged. The optional floating Agent button is hidden on mobile/touch layouts and whenever it overlaps the main panel.

- Do not add people bookmarks. Saves are for posts only. Discovery improvements must work from general operation documentation and ranking, never hardcoded search phrases. On installed mobile apps only, Friends and Posts extend to the side and bottom edges below the top controls; keep safe-area padding inside their content.

- Notifications is the first Settings item. Inbox, Automations and Chat search can open inside the current Friends/Posts browser panel, retaining Back navigation and drafts. Actual chat actions use the side chat on desktop and switch to the Agent tab on mobile, carrying their attachment/prompt/message target after the destination workspace is restored. Bare deep links choose the destination's natural mode; explicit mode-prefixed links preserve their requested mode. In-app navigation retains its current mode. Dismiss the source modal when navigating.

- New automations are created active with the next scheduled run through a single confirmed `automations.create` action. Do not save paused and require a separate enable step for creation. Resume paused automations through `automations.enable`; edits retain their separate reviewed re-enable behavior.

- Primary panel navigation writes shareable URLs and browser history. Use the canonical unprefixed path in its natural mode, adding /agent, /friends, /posts or /log only for another mode. Keep filters in query parameters, preserve tab drafts and mounted navigation state, and restore the visible view on Back/Forward. Settings overlays restore their underlying panel. The sidebar New Drugs wordmark uses bold Noto Serif. Tapping a panel title or empty header space scrolls its content to the top; header controls retain their actions.

- Profile overflow menus stay within the intersection of the visual viewport and panel clipping boundaries. Shift horizontally, flip above when needed, and retain scrolling inside short menus. Profile names and usernames share a baseline and font size, with usernames immediately after names; apply matching name/username sizes in post headers, the post editor and People results too.

- When asked to explore posts, the agent curates actual returned posts using relevant profile/activity context and its judgment, without hardcoded topics or phrase-routing rules. Open the ordered post_list in the main panel. Chat should only briefly introduce and link the selection, without quoting, summarizing or paraphrasing post contents; let the person read the cards first.

- Utility operations may remain agent/CLI/MCP-only. Add manual UI when it serves a useful user workflow, not automatically for every helper. Core social features still need usable direct controls.

- Log is the fourth native mode. Read `docs/log-integration/PLAN.md` and `PARITY.md` before extending it. `../logcal` is a read-only behavior reference. Log entries remain private or explicitly shared, outside public semantic search. Use existing accounts, friendships, storage and notifications. Each member owns their own note/media. Existing automations need explicit `logAccess` to read Log; social account activity or private chat alone never grants diary access.
