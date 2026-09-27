# Log integration

## Approved objective

After shipping the approved agent utilities, adapt `~/dev/logcal` into New Drugs as a native **Log** primary tab. The user wants essentially full parity in the features that matter, with deliberate adaptation and omission of duplicated infrastructure such as user accounts. It must feel like Log inside New Drugs, not an embedded separate app.

## Sequence

1. Finish and verify the utility release on production.
2. Read Logcal's instructions and implementation without editing or running the reference project. Inventory its actual features, data model, interactions and tests.
3. Create a parity map: port directly, adapt to New Drugs, or intentionally omit, with reasons. Account/auth/navigation duplication must use New Drugs' existing infrastructure.
4. Build the native Log experience, backend ownership/permissions, and useful CLI/MCP/agent operations. Keep private Log data out of public discovery unless explicitly designed otherwise.
5. Validate the important flows in New Drugs, maintain cloud dev, and update the operating guide.

The utility production approval does not imply a production release of this new Log project. Local frontends remain user-owned. No Logcal source files, servers or data should be modified.

## Status

- Approved utilities shipped and verified on **production v0.19.1** (release `20260926221734638`).
- Isolated checkpoint: branch `experiment/log`, tag `pre-log-v0.19.1`, commit `8298065`.
- Logcal source inventory and deliberate parity decisions are in [PARITY.md](PARITY.md).
- Native Log implemented as the fourth mode, reusing the existing primary panel, routing, mobile keyboard handling and independent Agent workspace.
- First cloud dev milestone: `20260926224433615`. **Final cloud dev release: `20260926233414675`**, verified healthy. Public version remains v0.19.1 because this was not a production release.

## Implemented

Continuous backward week scrolling with date-jump shortcuts, empty-day creation, gallery/list arrangements, private and shared scopes, invitation inbox, text/phrase/Boolean filters, participant filters, named account-backed views, URL state, local date handling, anniversaries/birthdays, adjacent-entry navigation, JSON/text export, and preserved drafts/navigation.

Entry editing supports common title/date/place/links/cover, per-person notes, eight attachments per contribution, photos, audio upload/recording and bounded video uploads. Images use existing downscaling/quota rules. Media authorization is checked on every request, including range requests. Hidden recordings stop; all media stops when its panel is inactive.

Sharing uses reviewed invitations to existing accepted friends. Join/decline, withdraw, leave, and owner deletion use the same operation layer as CLI/MCP. Current blocks and suspension are honored. Concurrent edits reject stale revisions. The editor preserves the draft, shows the latest version, and lets the person keep their changes while incorporating fields they did not edit, or discard their draft. No automatic friendship mutations. Log invitations use existing opt-in device push, with generic notice text and a reauthorized destination. Ordinary entry edits stay in the in-app notification history.

`log.list`, `log.get`, `log.create`, `log.update`, `log.contribute`, `log.invite`, `log.respond`, `log.revoke`, `log.leave`, `log.delete`, `log.people`, `log.neighbors`, `log.preferences`, `log.preferences_update`, and `log.export` are discoverable operations. List notes are bounded previews; full reads and exports preserve full text. CLI `file-upload <path> --log` handles Log media. Native links use `/log`, `/log/:id`, `/log/new`, with alternate-mode prefixes when needed.

Agent entry attachments reauthorize at submission and use. Log photo reads require the entry ID. Editor completion returns the verified saved entry to a waiting hosted run. Background automations require the new explicit `logAccess` grant; existing social/private-chat grants do not acquire it. Log never enters public semantic indexes.

## Validation

- Initial backend/date suite: 12 passed, one route normalization issue found and fixed.
- Integrated backend/navigation/date checks: 41 passed.
- Broad regression: 150 passed; two UI test fixtures needed Log data and the new native header target.
- Updated focused suite: 83 passed, covering Log CRUD/sharing/privacy/media/context/editor completion, dates, routing, rendering and existing app interactions.
- Browser review at desktop and 390px phone width used disposable in-memory fixtures, not writes to a real person's account. Verified calendar-day creation, save/detail, cleared draft, header geometry and mobile editor. Signed-out real frontend correctly funnels into account creation.
- Final release/access/CLI checks: 88 passed, then 90 with decline/profile privacy coverage.
- Final Log/push regression: **101 passed across 6 files**. Editor cancellation/navigation checks: **70 passed across 3 files**. These suites overlap; do not add their counts as unique tests.
- Browser review also checked 320px width: panel scrollWidth matched its 308px content width, with all text/date controls at least 16px. Temporary fixture and browser tab were removed.
- TypeScript and whitespace checks pass. Live cloud-dev CLI discovery/description and `log.list` read succeeded without writes or AI spending. Attachment order and stale revision handling each passed an additional focused backend regression check. Final UI/date/draft checks passed **71 tests**. Cloud dev and production health checks both passed after deployment. Production stayed on `20260926221734638`; the live dev CLI read and all 15 Log operation discoveries succeeded.

## Limits and deliberate adaptations

See PARITY.md for omissions. This is a web/PWA implementation, not an Expo transplant. There is no Logcal data migration and no production Log release yet. Original Logcal code, services and data remain untouched.

Search is private text/Boolean matching with structured filters, matching the reference's meaningful search capabilities. It is not advertised as semantic retrieval. Photos can be read by the agent; audio/video playback is supported, but automatic transcription or video understanding is not added. Recording and native playback still need a physical iPhone/iPad check. Uploaded files are retained in Storage when detached/deleted from an entry, so a shared file is never silently destroyed for another use. Deleting a file through Storage removes its Log references.

## Logcal UI correction

The initial month-grid layout was replaced following user feedback. The target is New Drugs styling with Logcal structure, not a redesigned diary UI. Calendar weeks extend in 52-week batches even through empty years; old date ranges remain mounted when opening an entry. Square photo mosaics, multi-entry day selection, the right-to-left four-wide contact sheet, Today’s entry strip and bottom create action, photo-first entry details, media-first editing, and bottom older/newer/back/edit actions restore the reference’s main decisions. Touch swipes on entry text navigate between entries without capturing photo-strip gestures.

Backend same-day ordering now uses creation time before the stable ID, with matching pagination and neighbor navigation. Existing old cursors are rejected clearly. UI/date/navigation tests passed 75 tests, and the combined Log backend/UI suite passed 96. Browser verification at 390px confirmed 52 → 104 → 156 weeks through empty history, stable scroll while appending, the four-wide sheet, and photo-first detail/editor layout. Disposable fixture data only; no real user entries were written.

UI correction deployed to cloud dev as `20260927003706998`. Production remains unchanged. The correction keeps New Drugs styling and restores Logcal’s continuous calendar, square mosaics, four-wide contact sheet, Today strip, photo-first details, media-first editor, and bottom entry actions.
