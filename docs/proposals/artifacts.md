# Artifacts

Author: Codex. October 22, 2026.

Status: approved by Cyrus for implementation on October 22, 2026, including inline/link presentation, ephemeral as list visibility only, and subsequently requested bearer-URL sharing without sign-in or a publishing step. Implement and verify the backend on cloud dev before frontend integration. Cyrus subsequently approved production deployment, immutable chat versions, explicit model-controlled attachment, scrolling previews, and the control placement described below.

An artifact is a saved, unlisted display created for a person by their agent. Anyone holding its unguessable ID URL can open it without signing in; listing and management remain owner-only. Its HTML describes the presentation. An optional JSON object holds the content. Optional saved instructions explain how an agent should refresh that content. A standalone HTML illustration, interactive calculator or other display needs neither data nor refresh instructions.

Cyrus's subsequent direction adds two independent choices: an artifact can appear inline in chat or as a link, and it can be ephemeral. **Ephemeral means persisted but omitted from the Artifacts list. That flag changes nothing else.** It does not cause expiry, deletion on chat clear, different permissions, or different viewing/update/history behavior.

## Experience

Add **Artifacts** after Chat search in the existing Agent launcher, then put the existing separator below the four-item group:

1. Agent inbox
2. Automations
3. Chat search
4. Artifacts

Use the installed Phosphor `Cube` export, with the same size, weight, backing and spacing as its neighbors. This is an Agent utility, not a fifth primary mode or another configured agent.

The list uses existing panel and row treatments, showing each non-ephemeral artifact's title and last saved time, newest updated first. Rows are real links opening the expanded viewer described below. Closing restores the mounted list and its scroll. Use the same viewer for an artifact opened from chat, the list or a direct link.

There is no manual HTML editor in this first version. People ask the agent to create or change an artifact. Bring into chat attaches that exact artifact so they can ask for a change. Local interactions inside the HTML, such as sliders, filters and calculations, work without an agent call; their temporary state is not a new persistent app database.

The canonical destinations are `/artifacts` and `/artifacts/:id`, naturally in Agent. The detail URL is also the share URL, using the server-generated UUIDv4 ID with 122 random bits; there is no extra publish state or separate sharing token. The list uses the existing Agent utility panel. As with Inbox, list navigation from another mode preserves that mode, and explicit mode-prefixed URLs retain it. The expanded viewer overlays its actual source rather than changing the underlying mode. Chat actions on mobile use the Agent tab and preserve the artifact as a return destination.

Opening, rereading or locally interacting with an artifact does not start AI work. Chat replies show or link the artifact using the requested presentation, without repeating its contents in prose.

## Presentation and list visibility

The delivery operation `artifacts.present` exposes `presentation: "inline" | "link"`; creation and updates expose `ephemeral: boolean`. Creating or editing never attaches an artifact automatically. The model independently decides whether to present any existing artifact or version in its reply, including when nothing was edited in that turn. Presentation describes how this result is delivered; ephemeral is a property of the persisted artifact. The same artifact may be presented inline in one response and linked in another.

| Presentation | Ephemeral | Chat result | Artifacts list |
| --- | --- | --- | --- |
| Inline | Yes | Rendered artifact with Open full screen | Omitted |
| Inline | No | Same rendered artifact | Included |
| Link | Yes | Link opening the expanded viewer | Omitted |
| Link | No | Same link | Included |

The agent chooses appropriate values from the actual request, without asking the person about implementation flags. A compact one-off graph or explanatory visual usually uses inline plus ephemeral. A reusable report, dashboard or document usually belongs in Artifacts; a large layout usually arrives as a link. Explicit instructions to save, keep it only in chat, show it inline or open it separately take precedence. These are general authoring guidelines, not keyword-based routing rules.

Do not create a transient artifact class. Both values use the same collection, IDs, storage accounting, authorization, revision checks, data, images and refresh operations. Reloading and returning through chat history still work. Exact links still resolve. Opening an ephemeral artifact does not add it to the list. The viewer menu can offer **Save to Artifacts** or **Hide from Artifacts**, changing only this flag through the normal revisioned update. There is no Ephemeral badge on the chat bubble.

### The inline bubble

Render the committed artifact inside the existing left-aligned black assistant bubble, using its current width, corners and spacing. Do not wrap it in a second card. Keep any brief introductory text above the display. A graph can be the entire reply; a repeated title, file icon, status badge and explanatory paragraph are not required.

Keep one quiet real **Open full screen** link at the bottom right below the rendered area, inside the same bubble, with the regular Phosphor `ArrowsOutSimple` icon after the label. Reserve the bottom left for **Show more / Show less**. The link stays outside the artifact's scrollport and remains usable on loading or rendering failure. Its actual destination is the artifact URL, supporting new-tab and context-menu actions. Clicking the chart itself interacts with the chart; it does not unexpectedly expand the whole bubble.

Author inline HTML for the available chat width. Use the existing message-preview height token. Taller content offers Show more / Show less with the shared message scroll-anchor behavior, and the collapsed iframe still permits native scrolling within that height. Keep the same live iframe through expansion and collapse. All inline frame layers have an explicit black backing, including overscroll. Do not scale a desktop chart down until its labels are unreadable. Keep artifacts outside text clipping while sharing the existing expansion hook.

New results appear in place without opening the full-screen viewer automatically. During generation, use the existing agent thinking/progress UI. Do not execute partial HTML from streamed text. Once committed, the artifact becomes stable assistant-message content; later token snapshots cannot remount it repeatedly. Artifact-only responses must survive completion, reload, history pagination and chat-search context jumps.

### The expanded viewer

Open a native top-layer viewer that fills the available app viewport on both mobile and desktop. This is an in-app expanded view, without invoking the browser Fullscreen API or requesting a permission. It can display a large graph or scroll a document while the chat/list remains mounted underneath.

Use a compact host-owned header with the artifact title, the existing native-share/copy-link treatment, and the circular **Close** control at the far right. Anonymous and non-owner viewers can view and share. An owner-only overflow control contains Bring into chat, Refresh when available, Rename, refresh-instruction editing, Save to/Hide from Artifacts and Delete. Keep the main viewing area devoted to the artifact. Apply New Drugs' safe-area, shared keyboard-height, typography and control rules. No duplicated mobile footer, extra Settings dialog or floating controls over the graph.

For an inline artifact, expand the same live rendering surface and browsing context, leaving a same-size placeholder in its message. Do not create a second iframe or reparent/recreate the first one and lose a selected range or slider position. Reuse the existing top-layer patterns, while verifying that the chosen native primitive preserves the iframe in Chromium and WebKit. Inline surfaces must not count as open dialogs in the existing global scroll blocker. Protect the expanded instance from offscreen eviction.

Close, Escape and browser Back return to the precise invoking bubble or list position, with the previous mode, draft and focus intact. Freeze the invoking message anchor while expanded so messages arriving underneath do not pull the return position to Latest. The header and Close appear immediately, even while the artifact loads. A direct URL/new tab opens the same viewer with a safe return to Artifacts when there is no prior source. No part of this behavior depends on the ephemeral flag.

### Example request flow

1. The person asks for a graph. The agent retrieves the needed data and prepares a compact responsive artifact, choosing inline presentation and ephemeral for an ordinary one-off answer.
2. `artifacts.create` saves the complete record and its first content version. The model separately calls `artifacts.present` if it chooses to attach the graph. Only that explicit operation binds a structured reference to the verified primary reply. The model can also present any already-existing artifact or version without creating or editing it.
3. The normal assistant message displays the graph and Open full screen. The graph remains in history after reload and does not appear in the Artifacts list.
4. Opening and closing the expanded viewer preserves the graph's local interaction state and the chat's position. Choosing Save to Artifacts adds this same record to the list, without copying it or changing the bubble.
5. For a larger requested document, the agent instead selects linked presentation. The assistant bubble contains a concise title link. Clicking it opens the same viewer; the ephemeral choice independently determines list inclusion.

## Record and rendering contract

Use a dedicated MongoDB collection and the existing operation system. No new service or frontend framework is needed.

| Field | Meaning |
| --- | --- |
| `id`, `userId` | Stable identity and owner, assigned by the server |
| `title` | Human-readable list/viewer title |
| `ephemeral` | Whether to omit this otherwise ordinary persisted artifact from the Artifacts list |
| `bodyHtml` | HTML body fragment, including optional inline CSS and JavaScript |
| `data` | Optional JSON object, normalized to `{}` when omitted on creation |
| `refreshInstruction` | Optional plain-text instruction for an agent, including expected data shape and retrieval guidance |
| `assets` | Bounded references to eligible owned images, when needed |
| `revision` | Optimistic concurrency counter for this exact artifact |
| `contentRevision` | Immutable saved HTML/data/image-reference version |
| `createdAt`, `updatedAt`, `dataUpdatedAt` | Creation, saved changes and last saved data update |
| `producer` | Server-derived hosted, automation or external-agent identity |

The trusted host builds the document wrapper and assigns safely escaped JSON to `globalThis.data` before artifact scripts run, following Wayfinder. The HTML explicitly renders from that object. For example, an HTML list could read `data.items`; refreshing changes the items without asking the model to recreate the layout. Pure HTML can ignore `data` entirely.

The refresh instruction is text for the agent, not another executable HTML document. It preserves the person's request and specifies the data the HTML expects, where to retrieve it, relevant constraints and how to handle missing information. It does not embed an artifact ID, changing account facts or copied general agent rules. The request supplies identity separately. A refresh instruction alone never enables a schedule.

An update replaces HTML, data and/or instructions atomically for one artifact. Omitted fields remain unchanged. `refreshInstruction: null` clears the instruction. Complete data replacement and bounded `set`/`remove` path patches are supported, mutually exclusively. Reject prototype-related keys and malformed/deep patches. This adapts Wayfinder's small data patches while also allowing a complete refreshed dataset to replace the old one.

For the first version, a changed HTML/data revision rebuilds the document, as Wayfinder does. The panel and outer scroll remain mounted, but temporary controls within the artifact reset when its content changes. Merely expanding/closing the viewer must not reset that state. Avoid rebuilding for unrelated live events, metadata-only edits or an ephemeral-flag change. Live in-place data synchronization and saved interactive state can follow a demonstrated need.

Persist a bounded artifact-reference array on assistant messages and their producing runs, containing artifact ID, presentation, optimistic revision and immutable contentRevision. Bodies remain outside message/live/history payloads. Each chat attachment resolves its saved content version; later edits never replace the earlier message. Canonical share URLs open the latest content, while `?version=N` opens a specific version. Existing references without a version resolve a frozen legacy baseline containing the first still-available source. Already-overwritten source is not invented or reconstructed from guesses.

The existing run completion transaction must retain structured output even when the assistant has no text. Carry references through bootstrap, live state, paginated history, search windows and compact model continuity. Bind them to the verified primary run rather than accepting a caller-supplied message ID. Retry receipts reuse the same artifact/reference without duplicate bubbles. A successful artifact write remains available if later prose fails; cancelled, cleared or superseded runs cannot recreate old messages.

Clear Chat removes chat delivery references and model context equally for both flag values, while retaining artifact records. Any broader artifact-deletion policy would be a separate request, not a hidden consequence of ephemeral.

## Create, edit and refresh

**Create:** the primary agent or an external CLI/MCP agent retrieves authorized information and saves one artifact with its ephemeral choice. Creation stores content only. The model separately chooses `artifacts.present` and its presentation when it wants the artifact attached to a reply. Creation of an unlisted artifact does not need a separate publishing approval; anyone given its URL can view its content, as requested. Automations and external agents retain their existing private Inbox delivery path and exact links; neither flag grants them permission to insert messages into the primary chat. A person can explicitly bring that output into chat. Do not extend legacy `conversation.append` to bypass that boundary.

**Edit:** Bring into chat attaches the artifact's ID and selected content version. Editing stores a new immutable content version. Prompt guidance encourages the model to present the updated artifact when useful, but no runtime rule attaches it automatically. Extend the existing explicit record-reference path rather than embedding the whole HTML in every chat message. The server reauthorizes the reference, supplies bounded identifying context, and the agent reads the current artifact when needed. Changes use its current revision and require ownership. Creation and updates do not post to public feeds or change profiles; the saved display is accessible to holders of its URL immediately.

**Refresh:** show the button only when a saved refresh instruction exists. Clicking it sends a request through the existing primary chat, explicitly bound to the artifact ID and the revision the person opened. Preserve the destination workspace's draft and attachments, just as automation examples do, while supplying the artifact reference separately. The current example-send helper deliberately omits record attachments, so it needs an explicit bounded task-reference input rather than being reused unchanged.

At run start, resolve the current artifact and check the bound revision. Use its saved instruction, HTML and data contract to retrieve fresh authorized information. For a data-backed artifact, refresh changes data while preserving the presentation. A pure HTML artifact can also have instructions that explicitly refresh its HTML content; no separate data object is required. Follow that saved scope rather than silently redesigning the display. Commit with the expected revision. If the artifact changed or was deleted, preserve the newer state and report the conflict rather than overwriting it or creating another artifact. Retrying the same submission uses the normal idempotency receipt.

The saved display remains available during work. Failed retrieval or cancellation leaves it unchanged. Existing chat progress and errors describe the work; the artifact viewer can reflect a linked active run without inventing a separate progress system. Keep Refresh unavailable while the primary chat is busy or awaiting review, so a convenience button cannot interrupt another task or reject pending writes. Check review state explicitly: the current `sendBusy` flag intentionally permits ordinary replies during review. Preserve the current sleeping-run supersession rules.

Hosted generation and refresh consume ordinary actual-cost agent credit. Viewing and direct CLI/MCP writes remain free from New Drugs' side. There is no hidden `artifacts.refresh` operation that starts a paid model call for an external caller.

Recurring refreshes use an explicitly requested Automation targeting the artifact ID. No artifact-specific scheduler is added. Existing private-access and write-access rules, run-bound authority, budgets, cancellation and stale-run fencing still apply. Do not copy Wayfinder's exception allowing some artifact writes from read-only background agents. An automation can update silently or publish a useful inbox link according to its saved instruction.

## Shared operations

All paths use the same catalog, validators, result contracts, authorization and idempotency. One write affects one artifact.

| Operation | Purpose |
| --- | --- |
| `artifacts.list` | Cursor-paginated owner summaries, excluding HTML/data/instruction bodies |
| `artifacts.get` | Owner management read including refresh instructions; bounded section reads for larger source/data |
| `artifacts.view` | Render-only HTML/data/images by exact unguessable ID, excluding owner-private metadata |
| `artifacts.create` | Create HTML with optional data, instruction and image references |
| `artifacts.update` | Partial edit with required current revision, including complete data replacement or bounded patches |
| `artifacts.present` | Resolve an existing owned artifact into a structured inline/link presentation descriptor, without changing its content |
| `artifacts.delete` | Confirmed permanent deletion bound to ID and revision |

Create accepts the persisted ephemeral flag and returns a saved summary. Update can change ephemeral without creating a content version. Present is an explicit authorized render-only read: it returns a presentation descriptor; only the verified primary hosted runtime binds that descriptor to its own response through durable call handling. A supplied bearer URL can be presented without granting its owner-private management permissions. External callers receive the descriptor/link, never permission to choose a primary-chat message or run. No new artifact is created just to show an existing one again.

Extend existing `app.open` with the artifact list/expanded-view destination. Add artifact references to route context, explicit chat attachments and returned resource links. Support instructions and bounded source access through these operations, without a separate CLI artifact implementation. Ordinary library listing excludes ephemeral records; exact reads include either kind. An explicitly requested owner/agent retrieval can include omitted records for management, without adding them to the visible library.

Delete removes the artifact content and releases its attachment references. It does not delete uploaded files used elsewhere. Old links become unavailable; a retry cannot delete a different artifact. Read-only credentials can read authorized artifacts but cannot create, change or delete them.

## Shared viewing and isolated HTML execution

Artifacts remain owned records but their ID URLs grant view access to anyone. Keep them out of public discovery and use noindex. Anonymous reads return only the title, HTML, JSON data, render revisions and eligible image aliases. Refresh instructions, producer identities, ephemeral/list state and unrelated owner metadata are omitted. Edit, delete, list and refresh operations still require the owner. No sign-in or guest-account creation is required merely to view a shared artifact. Share metadata may use its title plus generic New Drugs branding, resolved anonymously from the capability ID; it must never be enriched with signed-in account data. Keep development behind its existing private gate and local Vite proxy. Public viewing is distinct from relaxing HTML execution isolation.

Adapt Wayfinder's document builder and opaque-origin iframe: allow inline JavaScript for display interactions, omit same-origin privilege, use no-referrer, safely escape JSON, and restrict resource loading. Do not give the frame credentials, app DOM access, API access, tool execution or write capabilities. The presentation bridge is limited to bounded sizing, rendering errors and carefully handled navigation. Validate its frame source, per-frame channel and payloads. Generated messages are never instructions to the app or agent.

Carry New Drugs' Noto typography, theme tokens and mobile sizing into the trusted wrapper, with an explicit inline/expanded presentation context. Inline content uses explicit black backing and the assistant bubble's white foreground; custom chart colors must remain legible. Provide any font resources through fixed host-controlled handling. Do not copy Wayfinder's Inter font or white-only frame backing. Keep artifacts responsive and controls touch-friendly; avoid mounting live frames in list rows. Lazy-load frames near visible chat messages, enforce a small live-frame cap, and suspend offscreen executable content while retaining message geometry and scroll anchors. Expanded content is protected. These bounds apply equally to ephemeral artifacts.

Opaque iframe input focus is not visible to the current mobile keyboard detector. Add a narrowly validated editable-focus relay to the shared keyboard handling, without sending keystrokes or field contents. Preserve pinch zoom and at least 16px editable fields. Relay Escape only as a viewer-dismiss request. Neither channel can perform app writes or accept arbitrary navigation commands.

Use parent-resolved image aliases from the anonymous artifact projection, rather than arbitrary remote URLs or embedded credentials. Each image is read through an artifact-ID/alias route that rechecks the current artifact, ownership, attachment and deletion/moderation state; never expose original filenames. Bound the image count and decoded bytes. Reuse upload ownership checks and the attachment-reference index; Storage can link an attached image back to its artifact. Permit explicit replacement/removal rather than copying Wayfinder's append-only image limitation. Existing Log-owned uploads keep their single-hangout rule and cannot be reused as artifact attachments. Removing an artifact image releases that reference without silently deleting the original upload.

A single sandboxed iframe with a restrictive fetch CSP does not by itself prove that scripts cannot navigate the iframe to another origin. Implementation must test self-navigation, synthetic link messages and outbound data attempts in Chromium and WebKit. Constrain the enclosing frame policy as needed, using a small trusted wrapper if necessary. Do not broaden the app's public-site policy to make private artifacts work. Native app-owned links retain Command/Ctrl-click and middle-click behavior; do not blindly copy Wayfinder's catch-all link interceptor.

Catch source-construction failures, image failures, runtime exceptions and rejected promises within the artifact surface. Keep Back and Bring into chat usable. Do not replace an already visible successful render with a blank frame while new bytes load; if a new revision fails rendering, distinguish that failure from the previous displayed revision. Deletion or access revocation is different from a loading error: evict and unload unavailable artifacts, and remove revoked image bytes from retained renders. An iframe is not a CPU quota, so resource limits and hidden-frame teardown are also required.

## Bounded storage and live updates

Start with Wayfinder's tested per-record shape: 120-character titles, 120,000 UTF-8 bytes of HTML, 100,000 bytes of JSON, 16,000 characters of refresh instructions and bounded patch depth/count. Validate combined serialized request size on both HTTP and MCP. New Drugs' ordinary JSON request limit is currently 32 KB, so artifact writes need a narrowly scoped parser allowance rather than a global increase.

Proposed initial owner limits are 200 artifacts and 8 MiB of combined artifact text, maintained by transactional byte/count deltas. Image files continue to use the existing 64 MB upload allowance without duplicate byte accounting. These are implementation limits to validate, not new billing tiers. Keep immutable content snapshots within the same 8 MiB logical source allowance and a 2,000-version owner cap. Current content counts once; older snapshot source counts additionally. Metadata-only edits create no content snapshot. Refuse new content versions at capacity instead of silently discarding historical chat content. Deleting the root deletes its versions and releases their source allowance. Ordinary attachment indexing touches only current image refs; background backfill alone reads bounded historical metadata.

Index summaries by owner, list visibility, updated time and ID. Apply the ephemeral exclusion before cursor pagination. Fetch a page of 20 summaries with a maximum of 50 and a stable timestamp/ID cursor, projecting out the bodies in MongoDB. Fetch one full artifact only for a visible inline placement, an opened viewer or an explicit agent read. A visible shared viewer can poll an indexed revision-only endpoint at a bounded interval and on focus; transfer a new body only when its revision changes, and unload on revocation. Hidden viewers stop polling. Paginate or slice larger agent source reads. Do not put every artifact into startup/bootstrap or model context, and do not mount executable frames for every fetched historical message.

Publish transaction-bound, owner-scoped artifact invalidations with changed IDs. Refresh visible relevant panels; hidden panels become dirty without refetching every saved artifact. Never broadcast artifact changes globally. Anonymous capability viewers do not join an owner's private live subscription. Lists, frames and source reads must stay bounded independently of the account's age and artifact history.

## Implementation sequence after approval

1. **Contracts and server first.** Add shared artifact schemas and a backend module; integrate independent delivery presentation/list visibility, operation outputs, review consequence, resource links, Mongo indexes, attachment references, owner limits and scoped live events. Persist output references through the primary run/completion/history paths, including artifact-only replies. Add authorized route/record references and narrowly sized request parsing. Verify ownership, idempotency, revision conflicts, source bounds and automation permissions through the existing isolated test database.
2. **Deploy the ready backend to cloud dev.** Make shared API/MCP capabilities usable before starting frontend work. Keep the displayed production version unchanged.
3. **Renderer and panels.** Adapt Wayfinder's tested document builder/frame into New Drugs components and shared styling. Add the Artifacts list to the launcher and preserved panel stacks, inline output to assistant bubbles, and one reusable expanded viewer. Implement exact close/Back restoration, bounded active frames, image resolution, deletion, instruction editing and failure handling.
4. **Agent handoff.** Wire ID/revision-bound Refresh and explicit Bring into chat through the current chat flow, including mobile mode restoration, draft preservation and on-demand artifact reads. Update shared hosted and external-agent guidance with the creation/data/refresh contract and concise linked results.
5. **Verify the complete feature.** Use the user's running local Vite frontend with the deployed dev backend. Exercise all four presentation/visibility combinations, pure HTML, interactive HTML, reload/history and a real HTML-plus-data refresh. Production deployment was subsequently approved by Cyrus.

The contracts/server and isolated renderer work can be scoped to separate Sol Max subagents, with frontend integration starting after the backend reaches dev. The lead reviews the contracts, privacy boundary, actual browser behavior and final integration. No reference-app edits, test runs or server restarts are needed.

## Acceptance checks

- A pure HTML artifact creates and displays with omitted data/instructions. A data artifact receives its JSON before its scripts run.
- All four presentation/ephemeral combinations persist identically. Only the normal Artifacts list changes. Reload, history, exact access, ownership, quota and Clear Chat behavior do not branch on ephemeral; saving/hiding updates the same record.
- Artifact-only assistant replies survive run completion, live updates, older-history paging and context windows. Failed/retried tool calls cannot duplicate output or attach it to another run, and external/automation outputs cannot inject primary-chat bubbles.
- Open full screen preserves the same active graph controls; Close/Escape/Back restores the exact message/list anchor even if new messages arrive. Direct links work independently. Modified-click links retain normal browser behavior.
- Inline frames stay outside text-collapse clipping, within the chat width, and behind a measured active-frame cap. Keyboard-open fields and Escape work through the narrow trusted relay. No offscreen history accumulation creates unbounded running frames.
- Duplicate titles never confuse refresh targeting. An unrelated existing chat draft and its attachments survive Refresh, including a mobile mode change. Pending reviews are untouched.
- A data refresh preserves HTML and atomically saves valid data; a pure HTML artifact can refresh its content when its instruction explicitly requests that. Retrieval failure or cancellation preserves the saved artifact, and conflicts preserve the newer revision. Deletion unloads the artifact and never recreates it. Ordinary viewing causes zero provider calls.
- Anonymous and other-account viewers can open an exact shared URL, including ephemeral artifacts, without receiving owner-private instructions or management authority. Public-only agents can read a supplied capability ID with artifacts.view but cannot enumerate or manage the owner's artifacts. Deletion/suspension and attachment revocation invalidate shared views/images. UI, hosted Agent and CLI/MCP use the same record and contracts.
- Escaping survives `</script>` and Unicode separators; patch validation blocks prototype keys. No app cookies, parent DOM, privileged bridge actions or unauthorized images become accessible. Run browser navigation/egress regressions, not just DOM assertions.
- Mobile and desktop in both themes preserve panel Back/Forward, list scroll, chat drafts, keyboard handling, real-link behavior, loading geometry and usable error controls.
- In an isolated synthetic workload of 100,000 artifacts across 10,000 accounts, with heavy owners at the proposed caps and 1,000 subscribed clients, one owner's update reaches only interested sessions. List reads retrieve at most one projected page; opening an artifact retrieves only that artifact and bounded assets. Measure query work, payloads, latency and memory without real model calls. This is a proposed test workload, not a capacity claim or authorization to stress production.

## Scope held for later

Public discovery/publishing, collaborative editing, exports/PDF, pinning/folders, artifact semantic search, a visual/source editor, version-history browsing, arbitrary external JavaScript packages and persistent form-to-app actions are separate additions. The first version delivers unlisted agent-made HTML with bearer-URL sharing, inline or linked chat presentation, optional library inclusion, optional data, exact updates, refresh through chat and compatibility with existing explicitly configured Automations.

## Source basis

Read-only Wayfinder references:

- `../wayfinder/convex/schema/schemaAgentArtifacts.ts` and `convex/agentArtifacts/core.ts`: ownership, current record, optimistic updates, image references and deletion.
- `../wayfinder/src/app/api/v2/_lib/catalog/ops/agentArtifacts.ts` and runtime bindings: HTML/data/prompt contract and shared operations.
- `../wayfinder/src/components/agent-artifacts/artifactDocument.ts`, `AgentArtifactFrame.tsx`, `AgentArtifactFrameWithImages.tsx` and `AgentArtifactsPage.tsx`: safe JSON injection, frame isolation, image hydration and refresh handoff.
- Corresponding artifact lifecycle, image, summary-bounds, frame and refresh tests were read, not run.

New Drugs integration points inspected:

- `src/App.tsx`, `src/SocialExperience.tsx`, `src/InboxPanel.tsx`, `src/AutomationsPanel.tsx`, `shared/navigation.ts` and `shared/experience.ts`: existing panel and chat handoffs.
- `src/AgentLiveMessage.tsx`, `src/CollapsibleMessage.tsx`, `src/ImageViewer.tsx`, `src/LogModal.tsx`, `src/useConversationScroll.ts`, `src/useChatHistory.ts` and `src/useChatPosition.ts`: committed chat rendering, preserved top-layer views, scroll anchors and mobile keyboard constraints. Wayfinder has a dedicated artifact viewer but no generic inline artifact path to transplant.
- `server/wallet.ts`, `server/agentDraft.ts`, `server/account.ts`, `shared/types.ts` and the chat output projections: durable assistant output, artifact-only completion, history and clear-chat fencing.
- `server/recordContext.ts`, `server/pageContext.ts`, `server/sessionContext.ts` and their shared contracts: explicit context, current authorization and bounded model input.
- `shared/catalog.ts`, `shared/contracts.ts`, `shared/operationContract.ts`, `server/operations.ts` and `server/resourceLinks.ts`: common operation execution and review.
- `server/inbox.ts`, `server/backgroundAuthority.ts`, `server/automations.ts`, `server/agentAdmission.ts` and `server/runTypes.ts`: existing delivery, background permissions and run lifecycle.
- `server/websiteServing.ts`, `shared/website.ts`, `server/attachmentReferences.ts`, `server/app.ts`, `server/db.ts` and the live-refresh hooks: relevant existing infrastructure and limits.
- `docs/SCALING_AUDIT.md` and the shipped-scope section of `docs/scaling/IMPLEMENTATION.md`: bounded queries and targeted invalidation, without treating historical findings as current bugs.

One reference defect is deliberately not carried over: Wayfinder's Refresh button submits title-only text and its server page-context registry does not accept the artifact context emitted by the frontend. New Drugs needs an explicit authorized artifact reference and revision, independent of a title or the page still being open.
