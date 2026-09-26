# Production CLI audit, September 26, 2026

Production release: **v0.13.9**. This is an assessment, not an implemented fix list.

## Scope

Used the installed `newdrugs` CLI against the explicit `default` production profile. Updated the installed CLI from v0.9.1 to v0.13.9 with its own updater; saved production/dev logins survived. Read all 70 available social-operation definitions, using grouped discovery and explicit describe calls. Two operations, `runs.cancel` and `runs.wake`, were reached after comparing the source catalog because CLI discovery cannot enumerate its next page.

Recorded 59 structured read probes across 28 read operations, plus initial identity/wallet reads, natural-language catalog searches, three separate operator reads, and two file downloads. The recorded reads had a median end-to-end CLI duration of 0.78 seconds and a maximum of 1.63 seconds. This is a small warm-cache sample, not a load test. There were 58 successful recorded reads and one expected ownership rejection from `files.get` for another person's photo; the public-photo download path succeeded.

Checked 39 unique returned in-app URLs against the application's route parser. All parsed successfully. This confirms route validity, not browser rendering or focus behavior. No browser automation was used in this pass.

Four additional diagnostic tests reproduced the failures below in the isolated cloud database `newdrugs_test`, with synthetic accounts and mocked embeddings. Those tests deliberately assert the observed faulty behavior; they are evidence, not fixes or permanent regression tests. Synthetic records were cleaned afterward. The diagnostic source and private raw results are retained under `.data/research/prod-cli-audit-20260926/`, outside version control. Copy the diagnostic spec back into `tests/` to rerun it with the existing isolated-cloud test configuration.

Production actions were reads, including normal search retrieval/cache bookkeeping. No posts, messages, invitations, reports, likes, bookmarks, payments, automation runs, or account edits were submitted. The only local mutation outside audit artifacts was the installed CLI update. No application changes or deployments were made for this audit. The account balance was unchanged at $0.8653501.

## Confirmed problems

### 1. Chat-history search admits irrelevant results with a score of zero

**Confirmed live and reproduced in isolation.** `conversation.search` for `deep sea submersible pressure vessel design` returned four unrelated assistant messages, each with `score: 0`, `indexing: false`, and no warning. They concern automation settings and app capabilities.

The live query reaches the fresh-text fallback: its Mongo regex matches any query term as a substring. `sea` can match `search`, although the word-based lexical score is zero. The fallback then inserts that result without checking a positive score. It also runs against already indexed messages, so it can put rejected semantic candidates back into the answer.

The isolated reproduction stored only `search profiles` and searched for `sea`. That message was returned with a zero score.

**Fix:** validate actual lexical evidence before offering fallback results, and limit the fallback's role to genuinely unindexed/changed content. Preserve useful semantic neighbors without admitting zero-evidence matches.

Evidence: [private chat retrieval](../../server/search/chat.ts), particularly the `fresh` query and subsequent `offer` loop.

### 2. Saved views accept filters that they silently ignore

**Confirmed in code and reproduced in isolation.**

- `posts.list` with `scope: saved` ignores `authorId` and `kind`. A saved top-level post by another author was returned both for `authorId: currentUser` and for `kind: replies`. The same early-return branch also omits `near` and `radiusMiles`.
- `people.search` with `scope: saved` ignores `query`. A tennis profile was returned for the unrelated query `submersible engineering` with keyword mode. That branch also omits the accepted interest/geography filters.

These arguments are valid according to the published schemas, and the response gives no indication that the filters were discarded. An operator can therefore confidently answer a different question from the one asked. Saved-post semantic search uses a different path and its saved scope worked in the live empty-collection check.

**Fix:** apply the relevant filters consistently, or reject unsupported combinations explicitly. Do not silently accept them.

Evidence: [saved read branches](../../server/operations.ts), [published operation schemas](../../shared/catalog.ts).

### 3. Un-saving the bookmark used by a cursor breaks pagination

**Reproduced in isolation.** Read a one-item saved-post page, un-save that displayed item, then request the next page with the returned cursor. The next request returns 404 even though other saved posts remain.

The cursor is the bookmark row ID. `collectionPage` first looks up that exact row to recover its timestamp; removing the bookmark makes the cursor unusable. The UI keeps the returned cursor when it removes a saved card, so this can occur during ordinary browsing. Saved people use the same helper.

**Fix:** encode a stable ordering tuple in an owner-bound cursor so pagination does not depend on the continued existence of the boundary record.

Evidence: [collection pagination](../../server/socialCollections.ts), [saved-card removal and feed pagination](../../src/PostPanels.tsx).

### 4. CLI discovery still cannot follow its own next-page cursor

**Confirmed live on the current installed CLI and in its parser.** Empty keyword discovery returned 12 of 70 operations, `complete: false`, and a `nextCursor`. Keyword discovery for posts was also truncated. The CLI has no supported cursor/limit option. Its search parser joins every argument except `--keyword` into the query, so attempting to pass a cursor changes the search text instead of paging.

Narrower queries and exact `describe` calls are usable workarounds, but an external agent cannot reliably enumerate the catalog using the documented commands. This is an unresolved finding from the prior audit, not a new regression.

**Fix:** support `search --cursor`, `--limit`, and/or a deliberate all-results command. Keep operation discovery separate from content search.

Evidence: [CLI parser](../../cli/index.ts), [server discovery already supporting pagination](../../server/operationSearch.ts).

## Smaller but useful gaps

### 5. People bookmarks are exposed to agents but unfinished in the UI

`people.save` and `people.search {scope: saved}` exist in the production catalog. The current profile UI has no Save person control, and People has only Nearby / All people tabs. An explicit saved-people route can render the data, but the ordinary UI does not expose it. `people.save` also has no returned profile/list link builder or declared UI binding.

This qualifies the earlier broad claim of complete UI/CLI parity: post bookmarks are integrated; people bookmarks are not. Either finish that small surface or keep the unused capability out of normal discovery until it has a clear purpose.

Evidence: [person panel](../../src/PersonPanel.tsx), [people filters](../../src/NativePanels.tsx), [resource links](../../server/resourceLinks.ts).

### 6. Routine DM discovery ranks invitation writes above reading messages

For `newdrugs search "check my direct messages"`, the first four results were:

1. `connections.request` (write)
2. `connections.respond` (write)
3. `conversation.window` (the AI conversation)
4. `messages.list` (the desired DM read)

The tools remain clearly typed and described, so this is not an authorization bypass. It is avoidable operator friction that can send an agent toward the wrong social action or wrong kind of chat. Other tested queries were good: saved posts ranked `posts.list` first; tennis friends ranked `people.search` first; reading replies ranked `posts.replies` first.

**Fix:** add a small intent-based discovery evaluation set and tune descriptions/ranking for these common distinctions. This does not call for replacing semantic discovery with keyword search.

### 7. Rich attachments are readable but not searched by their rich content

The new image URL and a live MUSE document both parsed correctly through `links.preview`. MUSE returned its human-authored title, artist, artwork and audio descriptor. However, public indexing includes the post caption and literal attached URLs, not those linked titles/artists or article text. A URL-only post with an opaque slug therefore has little useful semantic content.

This is a capability gap, not a failed implementation of the current documented text index. If richer attachment discovery is desired, index bounded human-authored metadata with separate provenance and retain the source authorization rules. Do not infer profile traits or invent image descriptions as profile data.

Evidence: [public index source text](../../server/search/sources.ts), [rich preview projection](../../server/linkPreviews.ts).

## What worked

- Production has two indexed discoverable profiles, three top-level posts and one reply. No public indexing jobs were pending or failed. The small search inventory is real.
- Nearby discovery returned the other profile with an explicitly approximate distance between shared grid areas. Public people search excluded the caller.
- `tennis` and `someone to play racket sports with` both found the tennis profile. `coding` and `marine biology` returned no other people. Public-post `marine biology` returned no matches, improving on the previous audit's negative example.
- The wizard post ranked first for both `wizard` and `becoming a magical person`. Some broad lower-ranked neighbors remain; that is not grounds for turning semantic search into an exact-keyword requirement.
- Public post pagination at one item per page reproduced the full three-post order without duplicates or omissions. Author posts and replies were distinct and correct.
- Friends feeds and friends-scoped semantic retrieval returned only the accepted contact's post. The caller's own posts were excluded from Friends.
- `search.explain`, `search.similar`, and positive-feedback `search.refine` completed with evidence and native links.
- Private agent-chat pagination returned 32 unique messages across both pages. `conversation.window` included the selected search result, and search pagination continued correctly.
- `messages.get` returned the exact selected DM with its connection ID and a correctly labelled conversation-surface link. Notifications retained the read invitation and a reopenable conversation link.
- Existing URL attachments survived post/list reads. A direct JPEG preview returned a cached image descriptor; MUSE returned the expected validated structure.
- CLI download succeeded for an owned photo and the other person's visible public photo. Both were WebP with a 512px short edge. Denial of foreign `files.get` metadata matches that operation's documented owned-upload scope.
- Storage reported 190,006 bytes used out of 64 MiB. Wallet reads showed no active hold, and audit reads did not alter the balance.
- The saved worldwide-friends automation is active, with its next run Monday September 28 at 7am America/New_York. There are no run-history entries yet; no run was triggered for this audit. Its old saved instruction still contains the tennis/coding snapshot noted in the previous audit. I did not rewrite an approved configuration.
- Operator credentials remain separate and identify the production stage. There are no reports in the inspected stage. The shared starter pool shows $100 budget, $28 granted and $72 remaining.

## Practical priority

Fix zero-evidence chat search first, then the silently ignored saved filters. Repair saved-list cursor stability and CLI discovery pagination next. The new UI is supported by working operations; the main remaining problems are misleading retrieval results and a few incomplete boundaries, not a missing social backend.

Paid agent execution, automation delivery, notification push delivery, write-side moderation, checkout, and physical iPhone behavior were not exercised in this read-focused pass. No claims about those end-to-end flows are implied by the successful reads.
