# Private continuity around Log

| Field | Value |
| --- | --- |
| Author | Codex |
| Status | **Unconfirmed agent proposal** |
| Founder approval | **None** |
| Implementation authorization | **None** |
| Basis | New Drugs v0.38.1, October 1, 2026 |

## Verified starting point

Log records private or explicitly shared hangouts with one contribution per attendee. It has long backward calendar browsing, Grid/List, photos, notes, voice notes, QR/code joining, exact and semantic search, and `log.related` as a private CLI/MCP/Agent read. An invite code permits a full read-only view before sign-in, including notes and eligible media, while an ordinary hangout link remains private. The [Log research proposal](../../log-integration/SEMANTIC_SEARCH_AND_REPORTS.md) specifies how a future private report could cite source entries; it is research, not launch approval.

## Founder decisions to preserve

Log is the record of things that actually happened. It is outside public discovery and does not automatically fill a Post, profile or website. Another attendee owns their own note and media. An automation needs explicit `logAccess`. The founder did not authorize paid background report generation, automatic personality analysis or a new public social score. The recent website preview mistake makes any private-to-public transition especially sensitive.

## Codex hypothesis

The private side of New Drugs could be more valuable if a person can confidently **see what a share will disclose** and **recover a memory when they ask for it**. These are two separate product ideas, with the safety preflight as the smaller first discussion.

### Possible first slice: see the invitee's view

From an existing Log code panel, offer an optional “View what this code shows” link. It displays the same current read-only projection that a code holder would receive, including notes and eligible media, before the owner copies the link or shows the QR. This is an inspection affordance, not a new approval step in Scan or joining. It must track code reset, attachment deletion and audience changes exactly. Showing a watered-down summary would be worse than the current explicit full preview because it would imply privacy the code does not provide.

### Possible later slice: owner-requested reflection

A person could ask privately for related memories or a short overview of a chosen year/topic. Start with current `log.search` and `log.related` records and exact source links. If the user wants an interpretation, run it only on explicit request with a bounded evidence packet, cost display and source citations. Distinguish “recorded in Log” from what happened in a person's entire life. Do not diagnose relationships, nag about quiet periods or copy generated conclusions into a public profile. Source removal or lost access invalidates derived text.

### Separate craft issue: interrupted drafts

On mobile, unsaved Log text and fields can be lost on reload. A future recovery pass could keep an account-scoped, short-lived local draft for those fields with an explicit restore/discard choice. Shared-device cleanup, server revision conflicts and logout erasure come first. Staging photos or voice offline is a different, larger project.

## What would make this a poor choice

If the code panel already communicates its full audience clearly, another preview may add noise. A report that mostly restates obvious entries may not justify paid processing. Private drafts on a shared device can increase risk if their ownership and expiry are unclear. Each idea needs a distinct founder choice; none should be bundled into an automatic Log overhaul.
