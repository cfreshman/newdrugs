we are building "New Drugs" made in new england at druggie.org

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
- mobile chat is fixed at its lowest allowed position; no dragging or saved desktop position. Hide the app version on mobile. Desktop retains dragging.
- the launcher sits below the input on the left, top-aligned with the mic on the right. Clicking it transforms the input into an inline panel with a snappy real height animation and content fade. Every launcher child uses this same input space, never a modal. Clicking the launcher again restores the draft. Hide dictation and disable chat input while launcher screens are open, preserving the controls' space. Manual people, posts, invitations, DMs and blocking must work without the agent. The launcher menu fits its content; selecting any child expands the input panel to a 12px/safe-area gap at the top. No shrink debounce is needed because child panels keep a stable extent; Back and the title appear in both a pinned header and footer; content scrolls between them. Both launcher and mic support desktop dragging, open or closed; mobile stays fixed. Settings overlays and preserves the mounted launcher. Notifications belong in Settings and the top-right bell. Launcher and Settings option rows share a single treatment. On wide screens, launcher panels open beside chat, which remains usable; only move chat right if the panel would otherwise cross the left viewport edge. Closing the launcher preserves its mounted view/drafts/scroll. Reset returns to launcher options. The mic circle remains black; hide only its icon while typing or while the input is occupied by a narrow panel. Do not duplicate My profile in the launcher. Use cards, buttons, pills and pill-track tabs for actions; no custom underline offsets or thickness, and no trailing list separators. Storage is 64 MB per account; images use a 512px shorter side without upscaling and users can delete files in Settings. Autofocus the chat input on initial load and after launcher/settings close.
- desktop chat is 600px wide (25% wider than the original 480px), still bounded by the viewport gutters. Mobile uses the available width.

- no top page gap around the conversation. use all seven rainbow colors in an overlapping radial gradient composition with varied centers and sizes; do not arrange them in spectrum order or rainbow bands. keep a warm field behind the blue orb and user bubbles for contrast.

- agent bubbles are black with white text; user bubbles are blue.

- do not put errors or status text between the input and mic or let them move the controls. log technical failures. show user-actionable failures in the conversation.

- the regular input send button is black. do not brighten or dim the mic, dictation buttons or send button on hover, press, focus or disabled states.

- the chat input has no border. retain its rounded corners and no placeholder.

- a fixed Phosphor gear control in the top-right opens base settings, profile, billing, and external-agent connections. Desktop modals open from that corner with the X aligned to the gear; mobile modals stay centered.

- the settings circle is white glass. nested settings screens have a back arrow immediately left of the X. backdrop dismissal happens on outside pointer-down only, never pointer-up/click, so text selection does not close the modal.

- admin is a separate frontend under `admin/`, with its own sign-in. first setup creates the sole owner, using the trusted dev connection to prevent someone else claiming it. the owner manages one shared $100 starter-credit pool across prod/dev; each user gets $1 once while the pool has funds, and the budget can be raised later.

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
- keep only the background visible until initial chat/settings data has loaded. Chat starts close to the bottom unless the person has saved a dragged position.
- carry over Wayfinder's Show more / Show less behavior for long messages, including scroll anchoring and stable pointer/keyboard interactions. The send handoff uses a single moving object with inert copies of input and bubble crossfading inside it, retaining the bubble's corner shape.
- text should appear smoothly while a run is active, without restarting or disappearing between snapshots; completed messages show immediately. Prefer correct provider-to-browser event delivery over animation hiding stale state.
- scrolling the base page scrolls chat; native chat scrolling, modals, focused controls, pinch zoom and orb dragging retain their own interactions.

- development uses the cloud dev API, MongoDB and public MCP, with local Vite only on 7330. maintain and deploy the cloud dev backend as part of development. production is separate. use the OpenAI-hosted Agents API with its public HTTPS MCP connection, not a locally owned Agents SDK loop.

- the user starts and owns local dev servers. do not launch or restart local Vite/admin servers. provide the command and leave local ports free. continue maintaining cloud services and deploying cloud dev changes as needed. there is no local MongoDB or API server.

- Public semantic search combines persisted 512-dimensional vectors, lexical relevance and current source authorization. Nearby and All people are both available, in that order. Nearby is a strict coarse-area filter, not the only search scope. Do not index DMs, private chats, files or inferred profile traits into public discovery. External search is platform-funded, never deducted from user credit.
- The dev domain serves no public frontend. Local Vite injects the private development key; CLI and hosted MCP use their own bearer credentials. Never put that key in browser code.

- Agent-selected posts use the reusable PostList and a reopenable selection link. Keep navigation ancestors mounted so opening a post/reply and going Back preserves scroll, filters, pagination and drafts. Do not show a redundant Public reply label in the composer.
- Installed CLI releases follow Wayfinder's daily version check, strictly newer updates, preserved profiles, and explicit `uninstall --yes` cleanup. Never self-overwrite/uninstall a source checkout.
