# CLI audit fixes and installed-mobile layout

Follow-up to the September 26 production audit. The user subsequently authorized production rollout.

- Removed people bookmarks from the operation catalog, output types, reads/writes, navigation scopes, UI state, index setup and live subscriptions. Post bookmarks remain. No people-save operation or saved-people view is advertised or accessible.
- Private chat search now requires positive word evidence before admitting its fresh-text fallback. Substring-only candidates cannot create zero-score results. Current indexed content is not reintroduced by that fallback after rejection.
- Saved-post lists apply author, posts/replies and approximate-area filters before limiting the page. Nearby results retain coarse-area distance labels. Saved order remains newest bookmark first.
- New saved-post cursors contain the ordering boundary and a caller/filter identity rather than depending on the bookmark row remaining present. Removing the boundary bookmark no longer breaks the next page. Existing row-ID cursors remain usable while their boundary exists; stale legacy cursors return a restart instruction.
- CLI discovery accepts `--limit`, `--cursor`, and `--all`, with either separated or equals option values. Unknown options fail explicitly. All-results mode follows server cursors and rejects pagination loops. Search no longer downloads the entire operation catalog before performing discovery.
- Discovery embeds concise operation documentation and meaningful field descriptions/enums instead of raw JSON-schema boilerplate. DM inbox, human conversation and AI-chat descriptions now state their actual distinctions. No query-specific routing or hardcoded search phrases were added. A semantic continuation fails explicitly rather than switching ranking methods during an embedding outage.
- Installed mobile Friends/Posts panels extend to both side edges and the bottom, below the top controls. Safe-area padding is inside the content, including the secondary agent panel. Normal mobile browser tabs retain their gutters. Detection supports display-mode standalone and iOS's standalone flag.

## Validation

Initial targeted backend suite: 12 tests passed, including saved filters, removal-safe pagination, removed people-save APIs, CLI parsing/paging, and private chat fallback. UI/navigation suite: 68 tests passed. TypeScript and deploy builds passed.

Live dev CLI enumeration returned all 69 operations and no `people.save`. Semantic discovery ranked `messages.list` first and `connections.list` second for the audited DM-read intent. Other sampled intents continued ranking the intended reads first. These sample queries were used only for verification, not production query matching.

At a 390 × 844 browser viewport, a layout fixture measured installed social panel bounds at left 0, right 390, bottom 844, with 6px below top controls. After the final spacing adjustment, the normal browser variant measured 6px on the sides and bottom, 6px above the top controls, and 6px between controls and panel. Installed mode measured zero side/bottom gutters and retained the same top-control spacing. This checks browser CSS geometry, not physical-device installation or keyboard behavior.

Full regression suite: **282 tests passed across 49 files**. Standalone detection also passed two additional cases. The final mobile spacing adjustment uses matching 6px exterior gutters in browser tabs, while installed social panels retain their flush sides/bottom.

Final spacing/standalone/navigation rerun: **45 tests passed across three files**, followed by successful type checking and dev deployment.

## Subsequent UI polish

MUSE artwork now derives its radius from the containing card radius minus padding. URL labels omit scheme and `www.` while preserving actual destinations. Bare domains use [linkify-it](https://github.com/markdown-it/linkify-it) with the [public TLD catalog](https://github.com/stephenmathieson/node-tlds), including modern and international endings. Bare destinations default to HTTPS; explicitly authored HTTP links remain HTTP. Markdown code and explicit link labels are preserved.

The final renderer run passed 57 tests; the affected inbox/automation and CLI run passed nine tests. The server build now targets the project's supported Node 22 runtime explicitly, preserving JSON import attributes used by the TLD catalog. A compiled parser import was exercised directly in Node before redeployment.


Notification and chat navigation: Inbox, Automations and Chat history render in the current Friends/Posts browser stack. Back restores the prior view. Actual chat actions open the side chat on desktop, and switch to the Agent tab on mobile with their payload intact. Direct links respect the saved mode. The updated interaction, notification, history and route suite passed **79 tests**.

Production rollout completed as **v0.14.3**, release `20260926133001394`. Dev has the same application changes. Both service health checks passed. The installed CLI was updated and production catalog enumeration verified all 69 current operations, without people bookmarks.
