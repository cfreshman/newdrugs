# Post media and review replies

Implemented September 25, 2026. Production release authorized after development verification.

Posts and replies accept up to four owned, ready `agent_input` images in `fileIds`. The caption remains capped at 280 characters. The UI, CLI and hosted agent use the same `posts.create` and `posts.reply` operations. Publishing still requires the exact action review in the agent path, with photos displayed next to the caption. Manual Post/Reply is an explicit publish action. Existing upload processing strips metadata and downscales to a 512px shorter side without upscaling, within the existing 64 MB account quota.

An image uploaded to private chat is private until explicitly attached to a published post. Public reads require a live post reference and respect blocks. Deleting a post removes that public access unless another live post uses the image. The file remains in its owner's Storage because it can still belong to chat. Deleting the file in Storage removes every post reference transactionally and frees its storage. Profile photos remain human-selected and cannot be silently reused as post media by the agent.

Website links render shared preview cards in feeds, selected feeds, replies and draft composers. Up to three distinct external HTTP(S) links are shown. Native app links retain native navigation. Cards fetch near the viewport and retain a fixed height while metadata and thumbnails arrive. Closing a panel or navigating Back preserves its mounted content and scroll. Draft fetching is debounced; previews never hold up publishing.

`links.preview` exposes the same website metadata to CLI/MCP. It follows Open Graph, then Twitter metadata, then ordinary title/description. It returns text, never executable website markup. The real destination hostname stays visible; `og:url` cannot replace the user's target. Relative images resolve against the fetched page. Arbitrary embedded scripts, iframes, SVG and autoplay players are not supported.

The server resolves and validates every address, pins the actual socket lookup to a checked public address, and rechecks redirects. Requests have no user cookies or authorization headers. Only normal HTTP/HTTPS ports are supported. Time, redirect count, MIME types, bytes, image dimensions, concurrency and uncached requests per account are bounded. Images are decoded and re-encoded to small WebP thumbnails served from the authenticated same-origin API. Scrolling does not expose the reader's address to third-party image hosts. The remote website can observe the New Drugs server's fetch. Website URLs containing secrets should not be published.

Mongo stores shared previews for a day, failures for five minutes, with TTL indexes and a roughly 2,000-entry cap. This is platform cache storage, separate from user uploads. Expired cache images degrade to a plain website card. Failed fetches never prevent linking, posting or reading.

While a hosted run waits for confirmation, sending a chat message rejects all pending write approvals and saves the user's exact reply in one transaction. Completed actions and explicitly approved siblings are preserved. The rejected tool results return the correction and verified attachments to the same hosted run. It does not create a second credit hold or spend a second initial request. The normal continuation is still metered. Request IDs make retries safe; revision checks reject stale concurrent decisions. Typed “yes” does not approve an action. Confirm is explicit.

Reference code inspected, without changes: Pangaea `LinkPreview.jsx`, `SlimLinkPreview.jsx`, `Post.jsx`, backend `utils/linkPreview.js`; Wayfinder `AgentChatComposer.tsx` and `convex/agentRuntime/interactiveCore.ts` waiting-run replacement. New Drugs retains its own design and hosted runtime.

Protocol references: [Open Graph](https://ogp.me/), [Node HTTP request options](https://nodejs.org/api/http.html), [htmlparser2](https://github.com/fb55/htmlparser2), [ipaddr.js](https://www.npmjs.com/package/ipaddr.js), [Agents API](https://developers.openai.com/api/docs/guides/agents-api/overview).
