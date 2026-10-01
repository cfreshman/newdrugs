we are building "New Drugs" made in new england at druggie.org

Current handoff. Read this first when entering the project:

@docs/HANDOFF.md

Detailed operating guide and code map. Read the sections relevant to the task:

@docs/OPERATING_GUIDE.md

Past rollout notes live in docs/OPERATING_HISTORY.md. They are historical evidence, not current instructions or pending work.

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

- Before editing a visible control, inspect its neighboring controls and preserve their placement, capitalization, icon treatment, backing, spacing and height unless the user explicitly asks to change them. A user's lowercase wording specifies the words, not literal UI casing, unless they explicitly require that casing. Keep edits within the requested scope and verify the resulting desktop and mobile layout in the running app.

### Canonical UI styling

Treat the existing New Drugs UI as one design system. Before adding a control or form, find the same kind of interaction elsewhere in this checkout and copy its structure and classes. Do not design a new button family, card skin, field layout, disabled state or spacing scale for one screen. A visually similar result made with different CSS is still a mismatch.

| Need | Canonical source |
| --- | --- |
| Shared tokens, buttons, forms, cards, pills and focus states | `src/style.css` |
| Dark-theme token overrides | `src/appearance.css` |
| Main mode layout, panel density and People cards | `src/modes.css` |
| Human invitation flow and note field | `src/PersonPanel.tsx` |
| Profile rendering, including image shape and typography | `src/ProfileCard.tsx` |
| Explore filters and person-card composition | `src/NativePanels.tsx` |
| Settings rows and option controls | `src/App.tsx` and `src/appearance.css` |

- Use `.solid` for a standalone primary action such as Send invitation, Save or Publish. It uses `--primary`, `--on-primary`, `--primary-hover` and `--radius-control`. `.panel-actions` is a shared row of neutral pills; `.panel-actions .solid` intentionally changes a primary action to a black pill in that row. Do not substitute the row treatment for a standalone primary button.
- Use `.fields`, its existing `label`/`textarea` rules, and the same form structure as the closest existing flow. For an invitation note on an Explore card, follow the form in `src/PersonPanel.tsx`. Add only the layout needed to fit the card. Use `.text-link` for a quiet ancillary action, `.view-tabs` for mutually exclusive filters, and `.panel-actions` only where that row treatment is already appropriate.
- Pull color, border, radius, spacing and type from tokens. In particular use `--surface`, `--surface-soft`, `--ink`, `--muted`, `--primary`, `--on-primary`, `--control-black`, `--border`, `--border-width`, `--divider`, `--radius-control`, `--card-inset`, `--panel-inset`, `--space-*` and `--text-*`. Read the dark values in `src/appearance.css` before adding styles. Do not hardcode a new white/black backing or an arbitrary pixel size when a token already serves the purpose.
- Assign visual roles explicitly through shared classes. Never infer a primary action from `:first-child`, make sibling actions equal-width without precedent, or invent a secondary appearance by styling one button differently. A disabled primary control stays in its primary family and gets a clear disabled state. Keep the requested action's text casing and icon style consistent with adjacent controls.
- Check the resulting screen against its canonical counterpart at mobile and desktop widths, in light and dark themes. Inspect alignment, tap size, wrapping, enabled/disabled states and the keyboard-open form. If live visual inspection is unavailable, say so and do not claim it passed; source review or a component assertion is not a screenshot review.

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

- a fixed Phosphor gear control in the top-right opens base settings, profile, billing, and external-agent connections. When an already-open app observes a later, strictly newer server release, the gear becomes a filled Star with a badge and Settings gains a priority-styled top row to reload. Applying the update closes Settings and restores its underlying route before reloading on the next frame. Initial page load never raises this prompt. Desktop modals open from that corner with the X aligned to the control; mobile modals stay centered.

- the settings circle is white glass. nested settings screens have a back arrow immediately left of the X. backdrop dismissal happens on outside pointer-down only, never pointer-up/click, so text selection does not close the modal.

- admin is a separate frontend under `admin/`, with its own sign-in. first setup creates the sole owner, using the trusted dev connection to prevent someone else claiming it. the owner manages one shared $100 starter-credit pool across prod/dev; eligible saved accounts get $1 once while the pool has funds, limited to one new claim per public IPv4 address or IPv6 /64 using a shared keyed fingerprint. Guests only see the eligible dollar, without allocating it. Existing credit is preserved, and the budget can be raised later.

- show a small version left of the settings control. It reports the loaded browser bundle, never a newer server version before reload. Dev edits/builds/deploys must NOT bump the displayed release. On an explicitly approved production release, increment patch; if CLI/MCP operations changed since the published release, increment minor once, reset patch, then apply the production patch increment. Draft contracts use their own content revision for approval binding.

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
- Hosted and external agents proactively save information the user supplies when it is clearly durable and useful for future turns, without requiring a separate remember request. Preferences, decisions, constraints, commitments and future work all qualify; TODOs are only one example. Do not save transient details, changing account facts or inferred traits. Read memory context once near the start of a materially new external-agent task and retrieve relevant on-demand notes when needed, not before every individual operation.

- Automation instructions preserve the user’s original request and explicit constraints, adding only necessary missing direction. Never bake current profile tags/interests/location or other changing account facts into the saved instruction; read them fresh each run. Explicit user-requested topics remain fixed criteria. Keep schedule/permissions/budget in structured fields and shared behavior in base context, not repeated boilerplate in every prompt.

- Operation review versions describe each operation’s input/confirmation semantics, independently of release hashes and prose. Successful idempotency receipts survive compatible deployments. A real contract change renews the exact review rather than surfacing a generic drift error.
- Human connections use messages/connections destinations; external agent credentials use agents at /agents. Profiles include author-filtered Posts/Replies. Ending a connection retains its messages and original invitation; only the person who ended it can initiate reconnection, and only a declined invitation’s recipient can reconsider by inviting back.
- Automation credit/budget/service deferrals remain enabled, have an observable reason and retry time, and notify once per blocked occurrence. Genuine run failures notify separately from successful silence. Operator moderation stays in the scoped, confirmed, audited CLI; private-message evidence is limited to what the reporter explicitly submits.
- The user accepts the existing LLM usage-settlement behavior, including reconciliation against later credit. Backups remain deferred until the service has traction. Do not add either change as part of this operator-fix pass.

- The primary modes are Agent, Posts, Friends and Log. All three browser modes share main-column width and center their main panel in the viewport while the secondary agent is closed. With it open, shift the main panel left only as far as needed to let chat grow up to the main panel width, retaining its centered position when space permits and keeping room for the sidenav; secondary agent stays anchored to the bottom-right corner and fills available right-hand width up to the main panel width and covers the main content panel on mobile, preserving its gutters and the mode/settings controls above. Its Agent/X controls belong in a footer. Use shared orb-size/radius variables. The secondary Agent mic sits immediately left of Close in the footer; both are 40px circles. Secondary chat flows through the panel's top edge with no top fade or border gap, over a white-to-pale-blue background. Mobile top mode/settings controls use the same button/icon scale as desktop. Mobile mode switching is always icon-only; the switch uses the same backing tint and blur as Settings only while over content. Posts filters use accepted Friends, not Following; own posts belong in the profile.

- Display US country labels as US. Abbreviate US state names to postal codes only on mobile; desktop retains full state names. Preserve city names, non-US labels, and stored geographic data.

- Each primary mode owns its own agent subpanel open/closed state, draft, attachments, scroll and tool navigation. Switching modes restores the destination mode’s state, never copies the source tab’s state. Re-selecting the active mode still returns that mode to its base.

- Mobile browser content uses matching 6px exterior gutters, retaining safe-area insets. Installed mobile Friends/Posts reach the side and bottom edges beneath the top controls. The mobile agent subpanel covers the content-panel bounds.

- Deploy completed changes to cloud dev promptly after targeted validation, especially backend changes required by the local frontend. Do not defer dev updates until an entire larger experiment is finished. Production still requires an explicit request.

- Posts and replies support three separate URL attachments in addition to photos and a 280-character caption. Keep UI/CLI/MCP parity and exact-link review. Recognized providers and MUSE/POPS/CIF render natively; custom JSON and linked text are fetched through bounded public-URL validation, and inactive media stops playing.
- Posts and replies have a Share control immediately to the right of Save. Use the native share sheet when available, otherwise copy the canonical link and show a checkmark briefly.

- MUSE, CIF and POPS audio uses one shared compact native-style player: play/pause, elapsed time and scrubber, without volume controls or native/download menus. MUSE and CIF do not expose raw Source links. CIF reserves media geometry while loading; its media container radius is the outer card radius minus the card padding. Background scrolling in Friends/Posts targets the active main content and respects focused inputs, native subpanels and dialogs.

- Interior panel padding uses shared 12px desktop / 6px mobile insets, with 8px desktop / 6px mobile card padding. This density adjustment changes padding only, not DOM structure, gaps, margins or control sizes. Keep exterior gutters unchanged. The optional floating Agent button is hidden on mobile/touch layouts and whenever it overlaps the main panel.

- Do not add people bookmarks. Saves are for posts only. Discovery improvements must work from general operation documentation and ranking, never hardcoded search phrases. On installed mobile apps only, Friends and Posts extend to the side and bottom edges below the top controls; keep safe-area padding inside their content.

- Notifications is the first ordinary Settings item. A pending in-session app update may place its reload action above Notifications. Inbox, Automations and Chat search can open inside the current Friends/Posts browser panel, retaining Back navigation and drafts. Actual chat actions use the side chat on desktop and switch to the Agent tab on mobile, carrying their attachment/prompt/message target after the destination workspace is restored. Bare deep links choose the destination's natural mode; explicit mode-prefixed links preserve their requested mode. In-app navigation retains its current mode. Dismiss the source modal when navigating.

- New automations are created active with the next scheduled run through a single confirmed `automations.create` action. Do not save paused and require a separate enable step for creation. Resume paused automations through `automations.enable`; edits retain their separate reviewed re-enable behavior.

- Primary panel navigation writes shareable URLs and browser history. Use the canonical unprefixed path in its natural mode, adding /agent, /friends, /posts or /log only for another mode. Keep filters in query parameters, preserve tab drafts and mounted navigation state, and restore the visible view on Back/Forward. Settings overlays restore their underlying panel. The sidebar New Drugs wordmark uses bold Noto Serif. Tapping a panel title or empty header space scrolls its content to the top; header controls retain their actions.
- Every control whose purpose is navigation uses a real link destination while preserving its existing button, pill, tab or card appearance. Ordinary clicks retain in-app navigation. Command/Ctrl-click, middle-click and the browser context menu must support opening the destination in a new tab. Action controls remain buttons.

- Profile overflow menus stay within the intersection of the visual viewport and panel clipping boundaries. Shift horizontally, flip above when needed, and retain scrolling inside short menus. Profile names and usernames share a baseline and font size, with usernames immediately after names; apply matching name/username sizes in post headers, the post editor and People results too.

- When asked to explore posts, the agent curates actual returned posts using relevant profile/activity context and its judgment, without hardcoded topics or phrase-routing rules. Open the ordered post_list in the main panel. Chat should only briefly introduce and link the selection, without quoting, summarizing or paraphrasing post contents; let the person read the cards first.

- Utility operations may remain agent/CLI/MCP-only. Add manual UI when it serves a useful user workflow, not automatically for every helper. Core social features still need usable direct controls.

- Log is the fourth native mode. Read `docs/log-integration/PLAN.md` and `PARITY.md` before extending it. `../logcal` is a read-only behavior reference. Log entries remain private or explicitly shared, outside public semantic search. Use existing accounts, friendships, storage and notifications. Each member owns their own note/media. Existing automations need explicit `logAccess` to read Log; social account activity or private chat alone never grants diary access.

- Preserve Logcal’s major UI decisions for Log: continuous newest-week-first backward scrolling through empty years, square day mosaics, a four-wide contact sheet, photo-first entries and media-first editing. Skin those structures with New Drugs tokens and controls. Do not substitute month pages or rounded calendar cards when adapting features.

- Log keeps Logcal's shared-hangout model: QR/code joining, reusable people from past shared hangouts, plus accepted New Drugs friends in the picker. Do not reintroduce a separate invitation/acceptance flow for new Log entries. Any attendee can show its code or add eligible people. A person removes only their own attendance/note/media; the last attendee removes the empty hangout. Co-attendance does not silently open New Drugs DMs.
- Log has no generic panel header. Its scan/log controls and individual current-day hangout cards float over the scrolling calendar. Before 8am, yesterday's cards remain available too. Entry/editor/code panels overlay the preserved calendar; closing restores exact scroll. Keep source structure with New Drugs typography/colors.

- Log Scan is the camera with a Cancel control. Do not add paste-code forms, image-file pickers or start/stop camera buttons. Shared links open the Join screen directly.

- Log modals use the browser top layer to escape the panel clipping container, align to the base panel bounds with the same exterior gaps, follow its position when side chat moves it even without a size change, and use only one content inset. Do not add extra header/footer padding.

- Log editor uses Logcal’s Uncommon section with a Set as anniversary start toggle. Do not present One time/Anniversary/Birthday as recurrence choices: the marker remembers the original date, not a repeating hangout. Preserve existing birthday records without offering that invented choice for new entries.

- Log weekday labels live outside the calendar scrollport and stay completely fixed, including the initial scroll. Do not use a sticky header that moves through its top padding before sticking.

- An opened empty Log matches Logcal: keep the current person’s name header above their tap to add log prompt, and omit other empty note/media rows. Participants still appear in the with list.

- Log Grid runs newest first from the top left, left to right like Instagram, overriding Logcal’s original right-to-left contact sheet.
- A day square and its expanded multi-day panel order that day’s hangouts by creation time from earlier to later. The expanded panel is only a chooser: opening an entry enters the normal full-calendar Older/Newer chronology, never a day-scoped Previous/Next sublist. Grid and List remain newest-day-first.

- Log Close returns to the previous screen. Older/Newer navigation replaces the current hangout instead of adding history. Adjacent entries are preloaded. Code/Close/Edit share equal widths. Log overlays take the full available page height minus normal exterior gaps, including behind the page header, while leaving the desktop side agent usable.
- Remove me entirely belongs in the editor’s Uncommon section. Do not put a separate entry overflow menu/Ask agent action there. Hosted messages carry a server-validated current app route, following Wayfinder page context; it is a lookup hint, never permission to act. Reauthorize the referenced record when building model input.
- Log note and other text inputs use the same backing. The media action rail keeps its full width when Remove/Set cover are hidden. Link attachments have explicit add/remove controls and compact previews. Bare domains do not acquire a display or stored root slash; keep explicit URL paths intact.

- Tap to add log appears only on a truly empty entry. Existing title/place/links/media/anniversary or additional participants already count as information; do not nag for a separate note.
- The generic Log new event control always opens on the current local calendar day after a completed save. Date-specific calendar creation preserves the explicitly selected day. The day chooser has no Log another event action. Navigation clicks must not fall through to an underlying date or control.

- Today cards use horizontal swipes between full/left-square/right-square, saved per account in Log preferences. Squares and full cards have equal heights. Keep vertical list scrolling native and suppress clicks after a swipe. The loading spinner belongs in the media preview, including while the image itself loads.
- Today cards and the three-dots panel use Logcal’s 4px outer radius, with 2px photo corners. Multi-event calendar days open a centered mini chooser above the preserved calendar, with New Drugs backing and controls. Swipes navigate to occupied dates, including single-event dates, skipping empty dates without wrapping. Side arrows appear only on desktop; mobile/touch layouts hide them and use the recovered width for the chooser. Switching primary tabs hides and preserves the chooser; returning to Log restores it. Selecting an event dismisses the chooser, so closing that event returns directly to the calendar. There is no Close or Log another event button. Outside pointer-down and Escape dismiss it. Entries without photos retain colored squares; only loading contributor text reserves empty space.

- Log scope/person filters and saved views remain CLI/MCP-only. The List page has a search field that presents direct text matches first and semantic results after them. `log.related` is a CLI/MCP/agent read for similar entries from one joined Log entry; it has no Log UI control. Keep layout switching and export.

- Circle is a filter under Friends Explore that focuses people with mutual friends. Show mutual-friend count, names and overlapping profile photos directly on every eligible person card, including Nearby and All people; a profile can page through the full list. Precompute mutual counts and small photo previews in background work triggered by friendship changes, with bounded periodic reconciliation; browse and search requests must not walk or tally the graph. Explore cards offer an inline Add friend invitation note and a reversible Hide action. Group these actions at the right edge with the normal shared gap, Hide immediately before Add friend. Hiding a visible card replaces it in place with a compact Hidden card and Undo, without a timer; it stays until Undo or a filter/search change. Accepted friends show a disabled Friends button and no Hide button. Hidden people disappear from Nearby, All people, Circle and public profile-search results during retrieval, including semantic search and later cursor pages; Settings → Account → Hidden people provides Unhide. A hidden person's profile also shows Unhide in place of the invitation controls. An explicit agent/CLI/MCP `includeHidden` read can still include them. Desktop Explore uses two equal columns that fill the panel width; mobile uses one. Hide is separate from Block, Posts and Messages. The user explicitly rejected group chats; Messages remains focused on one-to-one invitations and conversations. DM text supports ordinary links and compact link-preview cards below the message, not Markdown link syntax or embedded media players. Live voice Talk follows the Twitter Spaces model for launching and joining public voice chats, replaces the proposed Now presence-status idea, stays separate from event planning, and leaves Log as the record of actual hangouts.

- Log Grid/List include bottom scroll clearance measured from the floating controls, so the last item scrolls fully above today cards and Scan/Log buttons.

- The Log three-dot control opens a compact Calendar/Grid/List picker and a More settings button for the separate Log settings panel. Cancel from Scan returns to its originating QR code when opened there; Scan opened from the calendar returns to the calendar. Close returns through the prior QR/entry screen; only Older/Newer replaces the current record.

- Log sidenav includes People, Birthdays, Anniversaries and Log settings; mobile reaches the same pages from Log settings. Profiles of friends or current co-attendees have a Hangouts tab using the shared Log list, preserving the current app mode and profile tab when closing a hangout.
- Birthday settings accept an optional owner-only birth year for personal calendar age markers. Public birthday projections contain month/day only and show reminders only to accepted New Drugs friends. Shared hangout attendance alone does not grant birthday access. Do not require the year or expose the year/age to other users. Use normal block/suspension gates; no public birthday directory. Older/Newer labels stay fixed, without neighboring dates that pop in after loading.
- Scan/Log controls use the same bottom inset as their side inset.

- Account Preferences contains Light/Dark/System theme, Mono/Sans/Serif font (Mono default), and a landing tab. Preferences stay private, sync between signed-in devices, and do not override explicit deep links. Account contains sign-in/security, blocked people and storage; Donate and Log out share a row.
- Log arrangement is a saved setting, not URL state. Item dates use uppercase full weekday/month names. Older/Newer labels sit next to their respective outside arrows.
- Log uploads belong to one hangout. Removing an attachment on Save or choosing Remove me entirely deletes that person's media and frees storage; other attendees keep theirs. Do not retain orphan files or reuse a Log file in another entry/post.
- Open modal shells immediately, keeping loading content mounted and hidden until ready. Back/Close stays usable. Cached content appears immediately. No artificial loading delay.
- The user explicitly approved the first Log production release and then migration of Cyrus and Laura's existing Logcal data. Migration must be additive/retry-safe, preserve account ownership and shared entries, and leave Logcal source data untouched.

- When another landing tab is preferred, Agent uses explicit `/agent`. Dark-mode panels, gradients, inputs and controls use warm charcoal/red-orange rather than blue. Preserve original Logcal entry/person/media IDs internally; future account linking happens only through a separate explicitly requested migration.

- Cache recent Log photos locally with IndexedDB through the marked-image service-worker path. Keep it account-scoped, bounded by bytes/count/age and available browser quota, with LRU eviction, background revalidation, and deletion/logout invalidation. Do not cache app/API responses or videos/audio. Do not clear persisted photos on startup before account identity is known.
- Load older Log weeks one scrollport ahead, adapting on resize. Retain visited week/image DOM during ordinary back-and-forth browsing; evict least recently viewed rows only beyond 260 weeks or 512 thumbnail elements, protecting the current viewport. Keep fetched date summaries for up to 104 five-week chunks. Retention must never expand the viewport-driven request range. Apply mobile bottom safe area once: outside inset panels, inside standalone edge-to-edge panels and their floating controls. Remove it while the keyboard is open. In mobile standalone, Log overlays fit the main content panel and leave the top mode/settings controls usable.

- Hard rule: do not add reduced-motion settings, prefers-reduced-motion queries, or animation-disabling branches based on OS motion preferences. Keep app animations consistent. Explicitly restore app animation options when third-party libraries alter them; do not override global browser APIs.

- Hangout snapshots are for initial presentation only. Always fetch the current entry immediately, let that response win, and evict revoked/deleted records. Keep the calendar mounted and preserve its layout/scroll behind overlays; do not regenerate its weeks for open/close transitions.

- Command+Up/Down must work from focused inputs and buttons, routing to the active containing panel without scrolling underlying pages through a modal. Keep ordinary typing/navigation and shifted selection shortcuts native. Calendar month labels mark the week containing the 1st of the new month; do not repeat a top-row month label. Right-align the personal age markers.

- Hangout photos form a non-wrapping horizontal strip. Support desktop grab dragging without click-through, continuous diagonal wheel projection, and vertical remainder handoff at edges; preserve native touch/zoom and hide scrollbars.
- Follow Logcal notification semantics: notify newly added attendees and the first note/media contribution by another attendee only. The creator counts as having contributed at creation. Later edits, metadata changes, content removal/re-addition, joins and leaving stay silent; keep realtime data updates separate. Preserve first-contribution state through later saves.

- Log voice notes belong below the written note, separately from the photo controls. Recording uses a Phosphor right arrow without a trailing line, advancing in discrete one-second steps like Logcal’s character bar. Preserve the 15-second capture and compact play/interrupt/remove flow. Do not import Logcal’s font asset. Adding audio must not duplicate photos or open a generic attachment-grid mode.

- Storage filters by attachment location (Hangouts/Profile/Posts/Chat) and file kind, combinable through UI and CLI/MCP. Keep account-wide usage above both scrolling filter rows, visible while results load. One attachment opens directly; multiple uses expand a compact chooser of single-line, content-sized link pills with ellipses. Following a Settings link preserves its mounted view, filters, expanded items, history and scroll for the next reopening. Do not allow the Settings panel itself to scroll horizontally.

- Log photo selection opens a square crop editor before uploading. Follow Logcal’s drag/pinch/zoom/reset/cancel/save interaction within the existing Log panel, preserve the mounted draft and scroll, and upload only the approved square at up to 512px without upscaling. The zoom handle and track have equal heights. Keep the native date picker, with padding on an outer field to avoid iOS date-input width overflow. All `.spin` loading indicators must visibly animate.

- Page-preview metadata uses anonymous public projections only. Ordinary private hangout links show generic View hangout branding and the gradient; a valid invite-code link may expose its saved title, attendee-list description and first eligible photo, without notes. Reauthorize image requests after code resets/deletions/privacy changes. Keep dev previews gated and all private/invite previews noindex; never enrich public metadata using a signed-in viewer.

- Invite-code pages show the full read-only hangout before sign-in, including notes, links, photos, voice notes, video and remembered participants. Code reset, deletion and attachment removal revoke future media requests. Ordinary hangout links remain private; website share metadata contains the title, attendee list and first photo. Preserve the native destination through sign-in, identity changes and auth-page reloads, then return to it after authentication/profile setup. Joining remains explicit; existing attendees open the hangout directly. Reset the browser title to New Drugs when the app mounts, retaining descriptive server share tags.

- Hangouts opened from an ordered collection use Previous/Next within that collection, including its filters and pagination. Preserve the source list and Back position; adjacent navigation replaces the current hangout. Direct calendar/deep-link openings retain Older/Newer. List date/location text uses a plain ` - ` separator.

- Image detail opens in its own native top-layer dialog above the still-open hangout. Keep the source popover/DOM/scroll intact during loading, viewing and dismissal; do not hide it just to put PhotoSwipe above the page.

- Transient spinners appear only after 500ms, while retaining their layout space and immediate busy/disabled behavior. Scroller-boundary pagination indicators stay immediate. Use shared spinner styling and the explicit `spinner-immediate` exception; PhotoSwipe’s internal preloader follows the same 500ms delay.

- Billing Activity keeps the latest three actual agent charges separate, then totals older consecutive agent/automation usage between credits or adjustments with real date ranges. Aggregate complete ledger periods on the server before limiting display rows; never sum only the last thirty raw receipts. Preserve raw receipts and balances.
- Image-viewer controls initialize before image dimensions or network reads finish. Reuse bounded decoded thumbnail pixels for the opening preview, while regular Log photos retain the account-scoped cache and invite images retain live code authorization.

- Before implementing Log semantic search or personal reports, read the research proposal: @docs/log-integration/SEMANTIC_SEARCH_AND_REPORTS.md. It is a plan, not authorization to launch paid processing or new public profiling.

- Scaling is an explicit product requirement. Read @docs/SCALING_AUDIT.md before expanding search, reports, live state or history. Avoid request-time full-history scans, whole-index rebuilds, global private-data invalidations and unbounded mounted history. Exact retrieval must have a bounded subset threshold; a cache or response limit does not bound underlying work. Prove capacity with an explicit workload, not today’s user count.

- Private video calls belong to accepted-friend DMs on desktop and mobile. Starting a call creates a waiting card without opening the video stage. The call stays active across app navigation; when the other person answers, open the stage automatically for both people. Show the bold username followed by regular Video call text, shortened to Video on mobile/touch, with a small circular progress indicator to its right and no icon inside the circle, and show connected-call duration on the ended DM card. Request microphone and camera together when possible. Keep the stage close to the read-only `../pair-video` reference, including its actual Squircle tiles, black field, local controls and mobile stack / desktop side-by-side layout. The remote video fills its square with edge cropping. Use quiet ringback and incoming tones while waiting. Talk is the user-facing name for the internal Spaces capability; individual rooms are Talk spaces. It belongs under Posts and follows the Twitter Spaces host/speaker/listener model. Creation requires a human-written title; description is optional. Public semantic search uses the title plus any description. The Talk header replaces New post with a right-aligned Open a talk space action whose icon follows the label; Cancel replaces it while composing. The Posts search field is reused directly below that header. Opening a space joins the host with the microphone on. An active Talk is a separate bottom panel that takes layout space below the current main panel in every mode, including Agent, with a small gap; it starts compact and expands to show people and controls. Green means the mic is live, red means muted, without extra On/Off text. Show description on demand in a small inline panel. Do not add tags. The media transport is a separate self-hosted LiveKit server with verified permissions, WebRTC and TURN; Log remains the record of actual hangouts.

- The secondary Agent dock does not open on mobile; the Agent tab is the mobile destination. A Talk space appears below that tab's chat. The compact Talk row shows overlapping speaker photos before the speaking count, followed by listener photos before the listening count only when listeners are present. Speaker photos are large enough to recognize. Requests to speak appear below Speakers and above Listeners, using the same plain heading style. A pending speaking request fills the listener's hand icon. Only muted speakers have a mic icon; unmuted speakers have no mic mark. Play a quiet cue for a new host speaking request and a separate cue when the requester is approved. Refreshing the browser rejoins the same account-scoped Talk space and restores mic state; a brief host disconnect does not end the space.

- Native personal websites are an active project. Read `docs/websites/HANDOFF.md` and inspect the read-only `../minnow`, `../pangaea`, and `../wayfinder` site implementations before extending it. Use the existing GPT-6 Luna Agent chat for creative editing and shared direct CLI/MCP operations for model-free edits. Keep one owner-scoped revisioned draft, a stable updating preview, an explicit reviewed publish, a profile Website link, a changeable username hostname and a permanent code hostname. Reserve the `u_` username prefix because it maps to the permanent `u-` site hostname namespace; existing `u_` accounts retain login and use their code address. For website icons, use actual Phosphor SVGs from `website.icons.search/get`; do not invent names or draw substitutes. Named checkpoints are created or deleted only when requested. Public website adaptation inspects bounded source snapshots and selected media, treating external source as untrusted data. The builder can use any supported ready media upload owned by the person. It finds older files through paginated Storage and asks the person to upload new files through the existing Uploads panel. Public site media paths use generated IDs plus real extensions, never original filenames or private `/api/files` URLs. Relative draft resource URLs must resolve under the stable preview token on localhost. Keep site content isolated from app cookies/API, and require a fresh explicit production request for future production changes.
- Personal website previews are reachable without login by anyone with the link. Private Log, chat and other nonpublic material may inform design decisions, but a request to build a site "based on" that material does not authorize placing its entries, quotes, dates, counts, names, media, or inferred private facts in the publicly reachable draft. Use public profile facts and content the person explicitly chooses for the site. Publishing review does not protect the draft preview.
- Before writing an approved product vision or roadmap in the repository, discuss the ideas with the founder and get explicit approval for the direction. The founder may explicitly request Codex-authored unconfirmed proposals; keep those in a separate area with the author, unconfirmed status and lack of implementation authorization on every document. Do not promote a proposal into an approved product decision without the founder's explicit choice. Clearly mark older studies as exploratory.

- Upload URLs and shared filenames use file IDs, retaining the actual extension. Original filenames are owner-private metadata available to the owner and their authorized agent through file reads. Never expose them in public/shared media projections or download filenames.
- Square palette, context and layer controls belong below the canvas; its persistent main toolbar may remain above it.

- Messages uses photo/name/preview rows that open the conversation directly through a real link. Keep invitation notes and separate Accept/Decline/Withdraw controls. Within a DM, the person, call and conversation-menu controls replace the generic Messages title in the panel’s top header, including Agent launcher panels; do not duplicate that row in the message body. The photo/name opens the profile. DM header control gaps use the same `--panel-inset` as its outside padding, including Back-to-photo and call-to-menu spacing. Mobile section-navigation tabs are hidden inside a DM and restored on the message list. Mobile uses an icon-only call control, and keyboard opening hides the same top header. DM text bubbles size to their text independently of link-preview widths, aligned right for the sender and left for the recipient. Only the DM composer’s bottom-left corner follows the outer panel curve, using the outer radius minus the panel inset, never the identical outer radius. Preserve its other three corners and always clamp that corner to at least the normal control radius, including with larger desktop padding or square standalone panels. Preserve message history, drafts and Back navigation.

- Ordinary verified browser reloads, navigation and manual actions must not consume anonymous/external-agent request quotas. Authenticate before applying normal API counters, and trust only the server-verified actor. Browser sessions also bypass the public, Chat and Log search frequency counters. Anonymous session creation and external access keep their limits; credential controls count failed attempts, not successful sign-ins or changes. Keep authorization, bounded work and resource admission intact.
- Every entry into a DM, including reopening a cached conversation without clicking a notification, marks its invitation, acceptance and video-call notifications read without deleting notification history, accepting an invitation or answering a call. New calls in the visible DM must trigger read marking even without a new text message. Text notifications retain the viewed-message boundary so newer unseen messages are not cleared. Never mark another account’s or conversation’s notifications.
