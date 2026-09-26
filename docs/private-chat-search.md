# Private agent-chat search

Chat history in the launcher searches saved user messages and assistant replies. The robot icon distinguishes it from social DMs. Search accepts topics, paraphrases, or remembered wording, with All / You / Your agent filters. Selecting a result loads twenty messages before and after it, expands the selected message, and scrolls it into view. Earlier and later pages remain readable. Live snapshots do not replace a historical window. The circular down arrow above the input returns to the latest messages, preserving the composer draft and failed outbox entries. Sending a new chat message also returns to latest.

## Shared operations

- `conversation.search`: owner-only semantic and lexical message retrieval, with short-lived owner-bound pagination.
- `conversation.window`: one authorized exact message and its surrounding context, including older/newer cursors.
- `conversation.list`: supports `before` or `after`, never both, for adjacent chronological pages.
- `app.open` with `view:chat_history`: open the search panel, optionally with a query. A verified `resourceId` opens that exact message in the hosted app. External agents receive an exact `/chat/MESSAGE_ID` link instead of claiming browser control.

All are available through the existing canonical UI/CLI/MCP catalog. Discovery guidance directs agents to private conversation search for recollection and leaves public people/post search separate. Reads have no credit charge.

## Indexing and privacy

Adapted from Wayfinder's conversation sidecars: persisted vectors, source hashes, background backfill, revision-guarded writes, and source reauthorization on every result. Unlike Wayfinder's inbox rollups, this app indexes individual messages with 2,000-character passages and 200-character overlaps, so topics near the end of a long reply remain searchable. Results deduplicate by message.

Private data lives in `chatSearchChunks`, `chatSearchJobs`, `chatSearchMeta`, and `chatSearchResults`. None is part of the public `searchDocuments` graph. Every query/cursor/window binds to the authenticated user; a client cannot supply another owner. Message text goes to the already configured embedding provider, using `text-embedding-3-small` with 512 dimensions. Query caches are namespaced by account. Text is never logged. DMs, file contents, and onboarding boilerplate are not indexed here.

Source writes enqueue jobs in their transaction, including external `conversation.append`, hosted user messages, final/interrupted agent replies, and typed review corrections. A bounded resumable backfill indexes existing history. Workers skip unchanged passages and reject stale jobs when the source revision changes. Deleted or re-owned messages cannot hydrate into results, even from cached search pages.

Search streams only the current owner's vectors from MongoDB, keeping a bounded candidate set in memory, rather than loading all users into a shared ANN graph. Semantic scores are combined with lexical overlap. Fresh text remains findable by keyword while indexing catches up. Provider or platform-budget failures fall back to keyword matches with an explicit notice. Indexing and queries use the existing platform search budget, not user AI credits. Retrieval snapshots expire in ten minutes and at most twenty are retained per account. Each account is limited to twenty new searches per minute.

The exact per-owner scan is appropriate for current conversation sizes; large-scale partitioned vector indexes can replace it later without changing the ownership contract. Pending-index and fallback notices disclose incomplete semantic coverage rather than treating it as a complete search.

## Validation

Tests cover account isolation, role filters, semantic paraphrases, long-message passages, public-index isolation, stale source rejection, owner-bound cursors, exact context windows, forward paging, transactional external writes, and honest provider fallback. History reducer tests cover live updates during a jump, returning to latest with a preserved failed outbox, and late responses after account changes. Isolated browser fixtures check narrow/wide layouts, actual scroll placement, the floating arrow, and the shared search-field spacing without posting or sending messages.
