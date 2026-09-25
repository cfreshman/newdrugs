# New Drugs implementation, September 25, 2026

The working app uses the OpenAI-hosted Agents API, cloud MongoDB, and a Vite frontend. Wayfinder and Pangaea are read-only references. Tests and implementation changes belong to New Drugs.

## Interaction model

Chat remains home. The launcher below the input opens People, Posts, Messages & invites, and file attachments inside the input's own space. All descendants keep that container. On wide desktops the container opens to the left of chat, leaving chat usable; chat moves only when needed to keep the side panel inside the viewport. Narrow layouts share the input space. Real height animates in 200 ms. The menu is compact; selecting a child expands to the top safe-area gap. Content changes do not change that fixed extent, and Back shrinks directly to the menu. Pending reads preserve the panel. Back and the title are repeated in a pinned header and footer, with content scrolling between them. There is no launcher modal or forced minimum height. Both launcher and mic support desktop dragging; mobile does not. A second launcher click restores the chat draft and focus while the launcher screen stays mounted. Reopening preserves its current view, scroll and typed messages. Reset returns to the launcher options and clears that screen. In one column, the occupied input cannot send chat or start dictation. The black circle remains, with its mic icon hidden. Side-by-side chat stays usable. Typing also hides only the mic icon.

Mobile starts at the bottom, cannot be dragged, and hides the version. Desktop retains dragging and a 600 px chat width. Settings stays at the top right on desktop, with its close button aligned to the gear; mobile settings uses a centered dialog. Opening settings preserves the mounted launcher underneath. Closing settings restores that view, or focuses chat when the launcher was closed. Initial load and closing the launcher focus chat. Browsers may restrict opening the software keyboard without a user gesture.

## Manual and agent capabilities

| Capability | Manual UI | CLI/MCP and hosted agent |
| --- | --- | --- |
| Discovery | Nearby/All people, semantic search, themed radius control, public profile view; post search in each feed scope | Public saved vectors, hybrid ranking, geographic/author/date filters, similar/refine/explain, current evidence and exact links |
| Profile | Human-written text, square photos, upload/reorder/remove, public preview | Read or open the human editor; cannot generate or edit profile content |
| Invitations | Send a note, accept/decline, withdraw pending outgoing invitation | Individual operations; invitation send/respond require exact review |
| Messages | Inbox, unread previews, conversation, earlier messages, direct Send | Read/send in accepted connections; requested DMs need no extra review |
| Posts | Compose, public/nearby/own feeds and agent-selected post lists, first-photo avatars, likes, public replies, threads, delete own content | Likes are reversible; publishing/replies/deletion use exact review, with authorized counts and links |
| Blocking/reporting | Profile/conversation controls, Settings block list and unblock | Same individual operations and authority checks |
| Notifications | Top-right bell and Settings, including invitations, DMs, likes and replies; exact destinations | Owned notification reads and individual read actions |
| Files | Upload picker, chat attachment chips, verified automatic continuation, 64 MB storage manager and permanent deletion | CLI upload/download, MCP owned file resources; hosted native image/text/PDF reading after attachment |
| Activity ideas | Clickable social URLs and pair.video entry in conversations | Existing built-in web search for verified current activity ideas |

A human clicking Publish, Send invitation, or Accept is the exact manual action. The model cannot mint its own hosted approval. Writes share one catalog, implementation, receipts and idempotency policy across the browser, CLI and MCP. There is no bulk execution API.

## Agent continuity and writing

The model is `gpt-6-luna`, medium reasoning, default service tier. Web search is already enabled. App links come from authorized results, with exact versus surface targeting, and the agent must put useful links directly into its prose.

The shared writing policy bans composed em dashes and requires outward messages to reflect the user's actual communication style, without inventing feelings, promises or personal facts. Exact text supplied by the user stays verbatim. The policy is present in hosted instructions, MCP instructions and the external CLI setup prompt.

Instructions and tool definitions are hashed. A subsequent task starts a new provider session when that hash changes, carrying recent owned conversation history, attached file references and completed action receipts. Existing provider sessions are archived, not deleted. Earlier history is still readable through operations. This is continuity reconstruction, not a native import of old hidden reasoning or pending provider tool state. Historical actions are not replayed. A task already running retains its current session until it ends.

The worker buffers provider events before reconciliation, flushes drafts on a timer, persists approvals/continuations, renews leases and reconciles completion. A completed final message cannot be replaced by a late send acknowledgement. Recovery of a quiet open provider turn requires a completed final item, no in-progress observed item and no required action; the existing answer is preserved when the provider turn is cancelled to release it. User cancellation does not restart the request.

## Reactivity and cost

A MongoDB change stream drives owned SSE projections for chat, runs, wallet and notifications, plus scoped invalidations for social views. No local database or local API server is part of development. User-owned local Vite remains on 7330 and proxies the cloud dev service.

Returned usage is charged cumulatively and idempotently. Missing/late provider usage is reconciled after completion, including corrections. Gear and billing use the same cent-rounding rule. The hosted API's reported usage is best effort and does not guarantee every final invoiced cost category, so unsupported extra costs are operator-funded. External CLI/MCP operations do not charge user AI credit.

All newly uploaded images are downscaled to a 512 px shorter side, preserving aspect ratio and never enlarging smaller originals. Stored-byte accounting enforces a 64 MB account quota. Deleting a photo in the profile editor also deletes its stored file and frees the quota; deleting via Settings storage removes an in-use profile photo too.

The shared starter pool, separate owner frontend, configurable no-expiry access tokens and private named CLI connections are implemented. Production Stripe credentials are configured. The account can accept live USD payments; its enabled webhook subscribes to charge.succeeded, charge.updated and charge.refunded. Signature acceptance/rejection was verified without making a real charge. Dev has no live Stripe credentials.

## Planned work and limits

Saved public profile/post/reply vectors and shared semantic retrieval are implemented. See [semantic search implementation](semantic-search-implementation.md) for current operations, source authorization, platform budgets, 10,000-document capacity and the measured 100-query synthetic evaluation. The [research plan](semantic-search-plan.md) retains later private datasets, event search and scaling options. Operation discovery remains a separate semantic catalog.

Pair.video is linked to its verified public homepage. The app does not fabricate call URLs or claim to have created a room. No video API integration has been deployed.

The implementation is an initial social product, not complete Twitter or Bumble parity. Push notifications, password recovery, group messaging, and general media attachments in DMs are not implemented yet. Those need their own shared operation contracts and manual controls.

## Entry flow, development access and install metadata

Guest social actions and hosted chat open account creation first. Registration leads directly to human profile editing; saving or choosing to set it up later resumes the held destination/chat. The server independently requires registration for hosted chat and social operations. Anonymous users cannot land in an empty public self-profile. Account switching clears private drafts and mounted panels.

Cloud dev serves authenticated API/MCP and CLI downloads, not a public frontend. Local Vite holds the dev access key server-side; valid bearer clients reach the API/MCP directly. Health checks remain public. Dev resource links target the local frontend, while production links target druggie.org.

PWA metadata includes standalone display, viewport-fit cover, 192/512 icons, maskable and Apple icons, exact name/tagline, and a 1200×630 link preview. The blue dimensional orb is the page/install icon. The interactive mic remains flat black. No private API caching or offline service worker is added. Reduced-motion overrides were removed as requested. Mobile bottom and side gutters match, with safe-area accommodation.

Agent-selected lists use `posts.list` with `scope:selected` and ordered `postIds`, then `app.open`/hosted `newdrugs_open` with `view:post_list`. Current visibility is enforced on every read, and the returned selection link reopens the same ordered feed. Cards share normal likes, replies, parent context and profile navigation. Navigation ancestors remain mounted, preserving scroll, filters, pagination and unfinished text when returning from a post or reply. Reset deliberately clears this state.

The installed CLI adapts Wayfinder's daily strictly-newer-version updater and explicit uninstall command. It verifies the published archive checksum, pins the selected New Drugs host, preserves connections during updates and never modifies a source checkout. An update takes effect on the next invocation. Uninstall removes only the recognized npm package, standard New Drugs MCP registrations and local saved logins.
