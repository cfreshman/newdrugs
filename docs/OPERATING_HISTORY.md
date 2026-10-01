# New Drugs operating history

Archived development and release notes through September 28, 2026. **Historical evidence, not current operating instructions.** Statements such as “not deployed,” “remaining,” “current,” and “authorized next” describe their original moment and may be superseded later in this file. Start with [HANDOFF.md](HANDOFF.md) for current state and authorization boundaries.

## Subsequent development

After the original handoff, deletion reviews were unified in `src/DeleteConfirmation.tsx` for posts/replies, stored files, inbox updates, and clearing agent chat. The compact inline card uses the existing soft surface, rounded Cancel control and red destructive control. Escape cancels, clicks stay inside the review, duplicate submissions are blocked, and a successful post deletion dismisses its review. Existing operation authorization and idempotency remain in the caller. This update is live on both stages; production is v0.17.4. The deletion interaction suite passed 63 tests, followed by three focused regression tests for successful dismissal and submission behavior. Production frontend and health checks passed.

The shared discovery guidance was subsequently updated for curated post exploration, with no hardcoded topics or phrase matching and no repetition of post contents in the chat handoff. The selected-list routing passed tests in both Posts and Friends, preserving card order and chat drafts. The targeted navigation/rendering/discovery suite passed 91 tests. This is instruction and catalog guidance, not a deterministic recommendation algorithm or a claim of a fresh live-model evaluation. It is live in v0.18.1; existing hosted sessions adopt the changed specification through the normal session-context path.

Both stages include the admin Users tab/operator `users.list` and `posts.incoming_replies` with a manual Replies to you profile tab. The user approved utility ideas 1–6, documented in [Agent utilities](agent-utilities.md). The other proposed utilities were declined or deferred. These shipped in v0.19.1, with 78 final targeted tests and 48 broader permission/automation checks passing. The production catalog and a DST resolution were also verified without running a model. The approved next project is [native Log integration](log-integration/PLAN.md) from `~/dev/logcal`.

## Log experiment (current dev work)

Read [the Log integration plan](log-integration/PLAN.md) and [parity decisions](log-integration/PARITY.md). The first Log production release was explicitly approved and shipped as v0.20.1. Branch `experiment/log` starts from checkpoint tag `pre-log-v0.19.1`. The new fourth tab reuses `SocialExperience`, existing mode state, mobile behavior and main-panel navigation. Core source is `shared/log.ts`, `server/log.ts`, `src/LogPanel.tsx`, and `src/log.css`.

Log is private or explicitly shared, never a public post dataset. Accounts/friends/auth stay canonical. People join by authenticated QR code or are directly added from past shared hangouts/accepted New Drugs friends. There is no new per-entry invite flow. Each person owns their contribution; leaving removes only themselves, even for the creator. Writes carry current entry revisions and ordinary idempotency keys. The `logAccess` background grant is separate from `accountActivity` and `privateChat`, defaults false for old records, and allows reads only.

Media uses the existing quota and file service with `log_media` purpose. `newdrugs file-upload <path> --log` uploads media through the CLI; source/dev builds expose this before a versioned prod CLI release. HTTP range responses recheck authorization. Deleting files removes Log references and updates revisions; detaching a file on Save deletes it and frees its storage. `log.list` returns bounded note previews; `log.get` and paginated `log.export` return full text.

The Log source project `../logcal` is read-only, like the other references. Do not copy its JWT accounts, friend graph, exact GPS behavior, native configuration. QR sharing remains part of Log, using authenticated joins and rotatable 128-bit codes. The parity map documents adaptations and intentional omissions.

Log completion evidence: dev release `20260926233414675`, with production unchanged at `20260926221734638`. Both health endpoints returned `ok:true`. The dev catalog exposes all 15 `log.*` operations, and live read-only CLI checks succeeded. The Log/push regression passed 101 tests; subsequent navigation/draft checks passed 71, plus focused backend tests for attachment order and stale revisions. Counts overlap across suites. Mobile UI was reviewed at 390px and 320px using disposable fixtures; no personal Log entries were created for QA. The code is checkpointed on `experiment/log`; see `git log` for the final implementation commit.

The first Log UI was corrected after the user clarified “New Drugs skin, Logcal bones.” Keep the reference calendar’s continuous backward weeks, flat square mosaics and four-wide contact sheet. Do not reintroduce month-by-month paging as the main experience. `src/LogCalendar.tsx` owns progressive calendar loading; `src/logCalendarModel.ts` defines adjacent year chunks. Day tiles open one entry or a chooser, and empty days create a dated draft. Photos lead entry details and editor media comes first. New Drugs fonts, palette, controls and native routing remain in use.

UI correction deployed to cloud dev as `20260927003706998`. Production remains unchanged. The correction keeps New Drugs styling and restores Logcal’s continuous calendar, square mosaics, four-wide contact sheet, Today strip, photo-first details, media-first editor, and bottom entry actions.

The latest Log correction restores source sharing and composition: `shared/logJoining.ts`, `src/LogJoining.tsx`, and `src/LogChrome.tsx` add local QR generation/scanning, join preview, and calendar-overlay controls. `log.contacts` merges co-attendees with accepted platform friends. `log.add_person` directly adds one contact after review; `log.join` joins by code. `log.leave` and compatibility `log.delete` remove only the caller. Legacy pending invitations remain processable, but `log.invite` is removed from the catalog. Do not bring back creator-only shared deletion or accepted-friend-only Log access. The main Log calendar has no header; the calendar stays mounted below entry overlays, with per-hangout today floaters and Scan/Log controls above it. Full physical iPhone camera/recording validation is still outstanding.

Verified corrected dev release: `20260927042457032`, healthy. The preceding same-backend release passed live CLI `log.join` schema and `log.contacts` read checks. Backend/UI integration: 127 passed; follow-up UI/date/navigation/contracts: 111 passed; final interaction guards: 4 passed. Counts overlap. TypeScript and build pass. Production remains `20260926221734638` (v0.19.1). Temporary browser fixtures were removed, viewport restored, and the test tab closed.


### Log interaction polish and current-page context

Follow the later user corrections over the original Logcal parity notes: Grid is newest-first, top-left to right. Weekdays sit outside the calendar scrollport and click to scroll to the top. Today cards swipe between full, left square and right square, all at the same height; `todayPresentation` is saved in Log preferences. Neighboring hangouts and their first photos preload. Close returns to the previous screen. Older/Newer replaces the active hangout, including its browser-history entry, so it does not create a chain to close through. The entry footer is three equal-width Code/Close/Edit buttons; Remove me entirely belongs under Uncommon in the editor. The Uncommon anniversary-start toggle marks a date to remember, not a recurring hangout.

`src/LogModal.tsx` uses a nonblocking top-layer popover, avoiding panel clipping while leaving the desktop Agent usable. It matches the main column horizontally and the outer page vertically, ignoring the mode header clearance. Photo viewing temporarily hides the overlay and restores it. Content has one inset, without extra header/footer padding. Scan is just camera and Cancel. Media controls reserve their full width; the spinner sits in the media preview. Note fields match other input backgrounds. Links have Add/Enter, removable preview cards, compact spacing, and no synthetic root slash. Only a truly empty entry shows the add-log prompt, with the user's name header.

Wayfinder page-context references were verified read-only: `../wayfinder/src/components/agent/AgentProvider.tsx` (`pageContextForPath`), `../wayfinder/convex/agentRuntime/pageContext.ts` (server authorization), and `agentRuntime/agentTools.ts` (lookup-only guidance). New Drugs now captures its recognized route per outgoing message, derives and authorizes the referenced resource server-side, and rechecks it in model input. This covers ordinary turns, reused sessions and review corrections. It is advisory context, never action authorization, and is not injected into background automations. Paths use the stage's canonical origin; local frontend routes therefore link through cloud dev. No separate CLI operation is needed for browser-owned current-page context.


Log now has actual People, Birthdays, Anniversaries and Log settings sidenav pages, with mobile links inside Log settings. Generic filter/saved-view UI has been removed; its operations remain. A compact in-page picker changes Calendar/Grid/List; More settings opens layout, birthday, directory shortcuts and export. Birthdays use `log.birthday_get`, `log.birthday_update`, `log.birthdays` and the separate `logBirthdays` collection. An optional birth year is owner-only; shared results contain month/day only. They are visible only to accepted New Drugs friends, with block/suspension checks and explicit background Log scope. Calendar markers and the Birthdays page link to profiles; they never create synthetic hangouts. Live birthday changes invalidate the calendar. `src/LogSettings.tsx`, `LogDirectory.tsx`, `ProfileHangouts.tsx` and shared `LogList.tsx` implement these surfaces. Accepted friends’ profiles show a Hangouts tab, containing only viewer-authorized shared entries. Opening one preserves the current mode and returns to the same profile tab when closed.


### First production Log release and migration

Native Log shipped to production as v0.20.1 on September 27. The user then authorized importing Cyrus and Laura’s Logcal history; [migration notes](log-integration/MIGRATION.md) record scope, source defects, metadata, tools and verification. Source Logcal code/services/data remain read-only. Historical attendee IDs are preserved for a later explicitly requested migration, with no automatic account linking.

Account Preferences now holds Light/Dark/System, Mono/Sans/Serif (Mono default), and the landing tab. Dark mode uses warm charcoal surfaces and a red-orange accent, including panel gradients. The chosen font applies across New Drugs. Account groups sign-in/security, blocks and Storage; Donate and Log out share a row. The landing preference only applies to a fresh root visit; Agent writes `/agent` when another tab is preferred. Explicit deep links are preserved.

Log layout lives in saved preferences rather than URLs. The quick three-dot picker switches Calendar/Grid/List, with More settings below. Week margins stay at least a day-cell wide and date type grows gently to 16px. Opened photos grow to at most 512px/42dvh on desktop, keeping mobile unchanged. Item dates use full uppercase weekday/month names. Older/Newer sit beside their respective outer arrows. Initial modal shells open synchronously, preserving mounted content and usable Close/Back during loading. Error states also remain dismissible.

Log files belong to one entry. Removing yourself or saving without a former attachment deletes your own media and releases quota. Other attendees retain their files. Deleted files become inaccessible in the same transaction, with physical cleanup immediately after commit and the existing cleanup worker as fallback. Post/other-entry reuse of bound files is rejected.

Push titles are `Notification`, avoiding duplicate app-name chrome on iOS. The service worker preserves generic Log/automation notices and their correct destinations. The Friends sidebar calls its inbox simply Messages.


Production v0.21.2 (`20260927110225148`) and dev (`20260927110013002`) include separate request budgets: 1,200/minute API, 3,000/minute media. Live headers confirmed both limits; sensitive endpoint limits remain. The production frontend matches its built HTML, both services are healthy, and authenticated CLI downloads of an imported photo/audio/video matched their hashes. Migration completion details and filesystem ownership verification are in MIGRATION.md.

The subsequent Log photo-cache/safe-area follow-up is documented in [IMAGE_CACHE.md](log-integration/IMAGE_CACHE.md). It replaces the earlier push-only service-worker policy with an explicit, private Log-image cache only. It does not cache HTML, operations, audio/video or account data. Preserve its startup identity gate, bounds and deletion/logout handling. Calendar prefetch now starts one viewport early; standalone Log overlays preserve access to top controls and put the home-indicator inset inside the panel.


The cache/safe-area follow-up shipped to dev `20260927112737233` and production **v0.21.3**, `20260927112944660`. The production HTML, service worker and cache script match their built artifacts; health checks pass. The UI/cache/calendar/modal regression suite passed 109 tests, followed by 19 cache/layout checks and 76 app/identity checks after final adjustments; counts overlap. Browser verification confirmed an IndexedDB hit across reload without an extra network request and simulated 34px bottom safe area in browser/standalone/keyboard layouts. Physical iPhone verification remains user/device testing. No semantic Log index was added: Log search remains private text/Boolean matching with date/person/scope filters.


### Initial hangout snapshots, render performance and private ages

The follow-up keeps recent full hangout snapshots in account-scoped IndexedDB: 200 entries, 4 MiB, seven days, with quota-error fallback and logout/account-switch cleanup. `src/logSnapshotStore.ts` owns storage; `src/logEntryCache.ts` provides synchronous memory seeds and async disk reads. Calendar/list clicks prime the already available entry immediately. A detail panel always starts a fresh `log.get`; the result immediately wins over memory/disk, late old requests cannot overwrite it, and revoked/deleted entries are evicted. Truncated list previews cannot replace full snapshots of the same revision. Editing waits for current full details, avoiding a save from a truncated preview. No API responses are intercepted or returned to agents from this presentation cache.

The calendar was staying mounted but rebuilding its date grid on overlay visibility changes. The grid now memoizes data-dependent rendering, uses stable event callbacks and reuses a date formatter. Calendar padding, header height and bottom clearance stay stable behind overlays. Regression tests verify the same calendar/week DOM, preserved scroll and no week regeneration during open/close. A synthetic 500-entry browser fixture measured the old visibility updates at 36.8–52.3 ms and the new ones at 0.4 ms; these are development-browser render timings, not physical-iPhone guarantees. Fixture files/tab were removed.

The no-reduced-motion rule is explicit in AGENTS.md. App code has no OS-motion-dependent branches; PhotoSwipe’s internally altered animation options are explicitly restored before initialization. The unused motion toggle in the test harness was removed.

The user also restored Logcal’s age margin. Log settings accepts an optional private year. The owner’s calendar displays full age on birthday weeks and quarter-year markers, including leap-day/month-end clamping. `log.birthday_get` reads only the caller’s private value; `log.birthday_update` preserves the year when omitted and removes it with year:null. `log.birthdays` remains month/day-only, including its own-user row, and profiles never expose the birth year or age. Historical source birth years have not been imported automatically.


Command+Up/Down is routed once at the application boundary and works from focused inputs/buttons. It targets the containing foreground panel: Log overlays or Settings first, the focused Agent dock when applicable, otherwise the active main panel. A DM’s transcript owns the jump rather than the composer. Shift-modified selection shortcuts and ordinary editing keys remain native. `src/pageBoundaryScroll.ts` owns this, separately from wheel/touch routing. The welcome paragraph now ends with “Or skip the AI entirely.”

Calendar month labels mark the week containing the first day of the new month, using the new month/year when a week straddles a boundary. Do not repeat the current month at the top of the visible calendar. Personal age/quarter markers are right-aligned, mirroring the left-aligned date labels.

Hangout photos are a single non-wrapping strip with fixed, non-shrinking photo widths, overriding the post grid’s half-width cap. Desktop mouse grabbing scrolls it without opening a photo after a drag; normal clicks still open the viewer. Wheel axes use a continuous signed projection (`deltaX + deltaY`), avoiding dominant-axis direction jumps. Unconsumed vertical motion at strip boundaries transfers to the nearest vertical scroll parent, respecting modal boundaries. Touch stays native, zoom gestures pass through, scrollbars remain hidden, and forced snapping is disabled. `src/horizontalMediaScroll.ts` owns the behavior; ordinary post grids are unaffected.

Log notification behavior now follows Logcal’s `sendHangoutNotifications` and `anyMediaOld` rules in `backend/src/routes/hangouts.js`: alert a newly added person, and alert existing attendees once when another attendee first adds a note/media. Creation counts as the creator’s contribution. A persisted `hasContributed` flag survives clearing/re-adding content; current content and creator identity cover legacy records without that flag. Later edits, metadata changes, QR joins, and leaving do not create alerts or reset read state. Live record updates still happen for every change. First-contribution pushes use generic text and recheck membership/read status. No old notification history was deleted.


The snapshot/age/scroll/notification batch shipped to production **v0.22.1**, release `20260927123847175`; production health and service status passed. All 37 Log backend checks passed, alongside the focused UI suites described above.

Voice-note follow-up restores Logcal’s dedicated controls below the written note. Photos and audio no longer trigger a shared attachment grid or duplicate the photo. Recording uses a Phosphor right arrow without a trailing line, advancing in discrete one-second steps, and a 15-second limit, then compact play/interrupt/remove controls. The user replaced the literal character bar with this icon treatment and removed the trailing line; do not restore the text bar or import Logcal’s font. Existing multiple audio attachments are preserved. Saved audio appears under its contributor’s note, without filenames or a generic media scrubber. The shared non-Log audio player is unchanged. Thirty focused editor/recorder/playback tests passed; microphone capture on physical iOS still needs device verification.

Voice-note/editor corrections are on cloud dev `20260927125404160`, with a successful build and database health check. The editor no longer repeats other attendees’ photos or offers that extra shared-photo section. Production remains v0.22.1 on its prior release; these subsequent voice UI corrections have only been deployed to dev.

The voice-note corrections, including the fixed Stop icon beyond the arrow’s 15-second endpoint, shipped to production **v0.22.2**, release `20260927125744979`. Dev is `20260927125622874`. Production health passed and served HTML matched the built artifact. The four recorder lifecycle checks passed again before release.


### Storage attachment navigation

Storage has two horizontally scrolling pill rows: attachment location first (All, Hangouts, Profile, Posts, Chat), then file kind (All, Images, Audio, Video, Documents). Both filters are applied before server pagination and can be combined; the quota meter remains the total account usage. `storage.list` exposes the same optional `attachedTo` and `type` filters to CLI/MCP, and validated attachment destinations plus exact resource links.

A file used once gets a direct destination link. Multiple uses get a compact attachment-count toggle that expands a list of recognizable titles/excerpts. The filename still opens the raw file separately. Choosing a destination closes Settings and navigates the active primary panel, including private chat context. Source lookups use actual current references, caller-owned uploads/posts/chat, current profile photos and authorized Log membership, with deletion/moderation/block gates. Files without a currently accessible destination retain their raw-file and delete controls. The message attachment lookup has an account/file index.

The backend/filter/privacy/navigation/editor regression run passed 121 tests. Storage-to-Log navigation was covered from all four modes; no real-account writes or paid model calls were used.

Settings navigation follow-up: following an in-app destination retains the current Settings dialog mounted but closed/inert, along with its filters, expanded attachment chooser, history and scroll. The top-right control restores it on reopening. Normal dismissal still resets the menu, and account changes discard the retained content. `Dialog` now supports visibility separately from mounting and gives each heading a unique ID.

Attachment links remain compact pills with one-line CSS ellipses inside the actual anchor. Storage no longer repeats the image-downscaling explanation. Settings clips horizontal overflow while both filter rows retain their own horizontal scrolling. An isolated browser fixture verified panel client/scroll widths of 376/376 at a 390px viewport and 306/306 at 320px, including long labels and expanded multi-attachment links. Fixture files/tab were removed and the viewport reset. The subsequent dialog/navigation regression suite passed 87 tests, including preserving the exact Storage DOM, filters, expanded chooser and scroll through a destination link.

Final Storage release: production **v0.23.4**, `20260927132706715`; dev `20260927132543335`. The account-wide usage total/bar sits above the filters with an explicit 6px gap. Summary and filters remain visible during all file-list reads; pending filter results retain their old geometry but stay hidden/inert behind a small spinner until the current response arrives. The final UI suite passed 88 tests. Production health passed, served HTML matched the built artifact, and live CLI description confirmed both filters and attachment output schemas. Native CSS ellipsis remains clickable; the browser does not underline its generated marker, and the user accepted leaving it standard.

### Switching GitHub accounts for one command

`scripts/github-cfreshman` remembers the current active github.com account, selects the saved `cfreshman` login, runs its arguments in the caller's working directory, and restores the previous login on exit, failures or handled interruption. It preserves the wrapped command's exit status; a failed restoration is reported explicitly. Both accounts are currently saved in GitHub CLI's keyring.

```sh
./scripts/github-cfreshman gh api user --jq .login
./scripts/github-cfreshman git push -u origin HEAD
```

For initial repository creation when explicitly requested:

```sh
./scripts/github-cfreshman gh repo create cfreshman/newdrugs --private --source=. --remote=origin --push
```

The helper supplies GitHub CLI credentials and GitHub SSH-to-HTTPS URL rewrites only through the wrapped process's Git configuration environment. Existing process-level Git configuration is preserved. It ignores inherited GH_TOKEN/GITHUB_TOKEN only inside the wrapper so they cannot override the requested saved account. It does not rewrite persistent Git configuration, remote URLs or commit identity. Eight isolated wrapper tests passed; a real read-only identity call returned cfreshman and restored the previously active account. No repository was created or pushed during validation.


### Log mobile date field and square photo editor

The mobile date control retains the native `type=date` picker, with padding/border on its outer label and a zero-padding, bounded-width input. This avoids the reported iOS width calculation issue tracked as WebKit 301648; the empty native value also retains a minimum height.

Read Logcal’s `app/components/LogEntry.tsx`, `ImageCropper.tsx`, and `lib/crop-view.ts` before implementing the crop step. Selecting/taking a Log photo now opens `src/LogPhotoEditor.tsx` inside the existing Log panel. The underlying editor stays mounted and inert, retaining draft fields and scroll. Drag, simultaneous pinch/pan, wheel zoom, keyboard positioning, a 1–6× slider, Reset, Cancel and Use photo are supported. The handle and track share their height variable. The chosen square is rendered locally to at most 512px without upscaling and only uploaded after acceptance. Cancel discards the temporary source; hidden/unmounted export work cannot upload afterward. Audio/video uploads keep their existing paths.

`src/photoCrop.ts` owns bounded source-space crop geometry and square output. Object URLs are revoked; late uploads after editor unmount are discarded. The previously undefined `.spin` class now uses the existing continuous rotation keyframes, fixing Log image/calendar loaders and other users of that class without OS-motion branches.

39 crop/Log/calendar checks passed, including focal-point preservation, pointer transitions, crop-before-upload, cancellation, retained draft/scroll, capped export size, and no upscale. A disposable browser fixture checked date bounds and square crop dimensions at 390px and 320px, zoom/reset/keyboard movement, actual WebP export and changing spinner transforms. Fixture files/tab were removed and viewport reset. Physical iOS camera/picker behavior still needs device verification. These changes are dev-only; the user explicitly returned to development after v0.23.4.

The mobile date/crop/spinner follow-up is live on dev `20260927135311617`, with a successful build and database health check. Production remains v0.23.4.

### Public link-preview projections and shared profile hangouts

Page previews are rendered on the server from a deliberately anonymous projection in `server/pagePreviews.ts`. No session or account context enriches a preview. `shared/pagePreview.ts` replaces only title/description/Open Graph/Twitter/canonical tags, preserving PWA metadata, viewport settings, icons and app assets, and escapes user-authored text.

Ordinary private Log entry/code links always say `View hangout (New Drugs)` and use the existing gradient, without reading the entry's title, notes, place, date or media. A current `/log/join/:code` capability may preview the first eligible image in display order, using the saved hangout title when present, without notes, with the attendee list used as its description. Invite images are resolved by code on each request; reset codes, deleted entries/files, moderated files and suspended participants stop future retrieval. Invite/private pages are noindex/nofollow. External preview services can retain previously fetched previews beyond our control.

Public posts may expose their public text/author and first photo. Only discoverable, unsuspended profiles expose their name/handle/bio/first photo. Non-public/removed records fall back to generic branding. `/api/share-images/:kind/:id` serves only these reauthorized projections; it does not make `/api/files` public. Both HTML/metadata and preview images use no-store. Staging still requires the trusted development key or valid bearer authentication. The Vite index transform fetches the cloud-dev metadata through its server-side key, so local HTML reflects the same rules without putting the key in client code. Production renders the built template at request time, so compare served HTML to `renderPagePreview` output rather than hashing it against the unrendered `dist/web/index.html`.

`people.get` now returns caller-scoped `hasSharedHangouts`. It is omitted for background agents lacking Log access. Profiles show Hangouts for friends or current co-attendees; `log.list` still returns only the viewer's accessible shared entries. Blocks/deletion/suspension continue to apply, and shared Log attendance does not unlock DMs. The combined preview, profile-hangout and full Log suite passed 46 tests.

The explicitly requested `ancatdubh2` production migration is complete: six memberships added, one existing membership retained, seven entries verified, no new entries/uploads/storage, with Cyrus/Laura's contents preserved. See `docs/log-integration/MIGRATION.md`. This data migration did not itself deploy app code.

Invite UI and authentication follow-up: valid invite-code holders can see the hangout's title/date/place/attendees and photos before creating an account, using the normal Log title/photo-strip/facts layout. This initial restriction was later superseded: valid invite holders can read notes, links and audio/video too, as described below. Photos use code-scoped URLs and are checked against the current code and attachment membership on every fetch; ordinary file URLs remain protected. Signed-in previews use `log.join_preview`, whose output now includes the same photo references. Existing attendees open the normal hangout directly, replacing the join screen; other visitors explicitly Join after authentication.

`src/authReturn.ts` keeps only a validated native return destination, in memory and in per-tab session storage for up to an hour. Login identity changes still clear the prior account's private UI state, but preserve this explicit return intent. Login completes the return flow instead of merely closing the form. Account creation retains profile setup and resumes afterward. Cancel clears the pending route. Invite previews refresh when reopened and on Log changes. The app resets the browser title to `New Drugs` on mount while server-rendered share metadata stays descriptive.

The integrated invite/auth/preview/profile suite passed 94 tests, including public invite photo access and revocation, no private note/bio exposure, login under a different account ID, authentication-page reload recovery, and title reset. Three focused auth/title checks passed after the final preview-refresh change. Live dev verification found an invite with two photos and fetched its first image successfully (200, image/webp, 30,236 bytes); no code or private content was printed in diagnostic output.

Title/caching refinement: valid invite share previews use the saved hangout title, preserving its casing, with `View hangout (New Drugs)` as the fallback. Ordinary private links still never look up or expose that title. Profile/post fallback titles use sentence case too. The seven preview privacy tests and eight existing link-preview checks passed.

First-party New Drugs `links.preview` results now come directly from the current anonymous page projection, with direct reauthorized image URLs, rather than the generic 24-hour external-site cache. Code-scoped photo URLs remain direct too. Legacy first-party cached image proxy URLs refuse to serve old bytes, so code resets and profile privacy changes cannot be bypassed by that server cache. External sites retain their existing bounded preview cache.

Final preview/invite release: production **v0.25.1**, `20260927145719095`; dev `20260927145610619`. Production health passed. Ordinary private-link HTML had the generic sentence-case title, gradient and noindex tags, with its body matching the built frontend. A live valid invite used its saved title and returned its photo successfully without authentication. The CLI verified both fresh private-safe `links.preview` output and `hasSharedHangouts:true` for the newly linked account. The earlier mobile date, square crop and loader changes are included in this production release too.

### Source-list hangout navigation

Following Logcal’s `Profile.tsx` and `HangoutView.tsx` sequential navigation, profile Hangouts, Log Grid/List, day choosers, Today cards and Anniversaries now carry their displayed collection into the detail view. Previous/Next walks that order without wrapping or escaping into the whole calendar. Paginated collections retain their source query and cursor; adjacent details/photos are prefetched, and inaccessible entries are skipped. Direct calendar and bare-link openings retain Older/Newer.

`src/logSequence.ts` creates browser-only collection context; `src/useLogNeighbors.ts` resolves authorized adjacent records using existing operations. No new CLI/MCP contract is needed. Collection IDs are not encoded in share URLs or treated as authorization. Adjacent transitions replace the current hangout/history entry; Back restores the source profile/list, selected tab and scroll. Browser Back/Forward preserves validated collection context, including inside Agent. List date/place text uses ` - `. TypeScript and 162 targeted UI/navigation tests pass. Production remains v0.25.1 until separately requested.

This navigation/separator update is deployed to cloud dev `20260927151558752`; the build and database-backed health check passed. Production is unchanged.

The user subsequently requested production. Source-list hangout navigation and the hyphen separator shipped as **v0.26.1**, release `20260927152055905`. Production service and public API health passed; the live page references the built release assets.

Mobile/touch invite previews now shorten the account button to “Sign in”; desktop keeps the longer label. The entry save pending state is exactly `One sec...` with three ordinary periods. Existing auth/join behavior is unchanged. TypeScript and 83 app interaction checks passed. Both changes are live on production v0.26.2 (`20260927162436678`) and dev (`20260927162548927`), with successful health checks and production asset verification.

### Full invite-code hangout view

The user explicitly expanded invite previews to the full hangout information. Valid code holders now see current members’ complete notes, links, recurrence marker, imported participant names and code-scoped photo/audio/video attachments before signing in or joining. `log.join_preview` exposes the same projection to CLI/MCP. It never changes attendance or unlocks unrelated profile data. `src/LogMedia.tsx` shares the existing media rendering with regular hangouts; notes retain Markdown and author labels.

`server/logInvites.ts` resolves every attachment from the current code, current membership, file ownership and live file state. Anonymous media supports range requests for playback, stays no-store/noindex, and is revoked on code rotation, removal, deletion or suspension. Ordinary private links remain generic; website share metadata uses the saved title, attendee-list description and first eligible photo, without notes.

The full invite-content change passed TypeScript and 150 targeted backend/UI/privacy tests, including full notes through CLI previews, no implicit joining, Markdown rendering, audio/video ranges, forged/nonmember attachment rejection, moderation/removal/suspension/code-reset revocation, and unchanged private-link/share-metadata boundaries.

Full invite views are deployed to dev `20260927163450735` and, after the explicit production request, **v0.27.1**, production `20260927163601831`. Both deployment health checks passed. Live production assets and the CLI `log.join_preview` output schema were verified without writing social data or spending credits.

Hangout typography follow-up: titles use normal `--ink` text color. Note authors match the attendee list’s 14px body sizing, line height and normal weight; actionable profile buttons share the accent/disabled styling, while invite-preview names are ordinary text. Deployed to dev `20260927164245326` with a successful build and health check; this styling follow-up is not yet on production.

The typography follow-up subsequently shipped to production on explicit request: **v0.27.2**, `20260927164455996`. Build, deployment health, public API health and live release assets passed verification.

### Image viewer above hangouts

The flicker came from marking the social workspace covered, which hid its Log popover, while PhotoSwipe loaded into the ordinary document body. ImageViewer now opens a full-viewport native dialog before async loading and appends PhotoSwipe into that dialog. The active Log popover stays open underneath; its media remains paused while covered. Closing the viewer returns focus to the source image without dismissing/reopening the hangout or changing its navigation.

TypeScript and 113 targeted viewer/Log/readiness/app tests passed. An isolated Chrome fixture verified the hangout remains `:popover-open` while the image dialog is `:modal`, and closing preserves its draft and restores focus. Fixture files and tabs were removed. No real account data was changed.

The image-loading layer must stay transparent. An opaque black loader followed by PhotoSwipe’s transparent-to-black opening fade caused a second flash; only PhotoSwipe owns the background transition.

Transient spinners now use `src/spinner.css`: hide the indicator for the first 500ms without delaying requests, content, busy state or control disabling. A short load ends without ever showing it. Once shown, it stays visible for the ongoing load and is removed as soon as ready; rerenders do not restart the wait. Scroll-boundary pagination spinners explicitly use `spinner-immediate`, and PhotoSwipe’s own preloader waits 500ms too. Native-browser timing verification confirmed a 200ms load never appeared, a long load was hidden at 100ms and visible after 500ms, immediate pagination stayed visible, and rotation continued. Temporary timing fixtures were removed.

The complete image-layer/transparent-loading/spinner-delay follow-up is on cloud dev `20260927165748529`, with a successful build and database health check. The additional pagination/viewer suites passed 39 and 8 checks (overlapping earlier coverage). Production remains v0.27.2 pending an explicit request for this follow-up.

The image-layer, transparent-loading and 500ms transient-spinner fixes subsequently shipped on explicit request as **v0.27.3**, production `20260927170616543`. Build, deployment health, public API health and live release assets passed verification.

### Immediate photo viewing, grouped billing, and native link cards

ImageViewer initializes PhotoSwipe synchronously inside the top-layer dialog, before image dimensions finish loading. Pending slides fill in afterward without recreating the viewer. Known slides are not refreshed unnecessarily during the opening transition. PostPhotos supplies a bounded (1024px longest edge) in-memory snapshot of the selected decoded thumbnail as the opening preview; it is not persisted. Normal Log photos use the same marked URL and existing account-scoped IndexedDB cache in both places. Invite photos remain code-checked/no-store, with the decoded snapshot only covering the current opening.

Billing Activity reads `wallet.activity` only while open and refreshes with live wallet receipts. It keeps the three most recent nonzero agent charges individually, including automations, then totals older contiguous usage between credit/adjustment records. Date ranges use actual oldest/newest receipt times; same-day ranges include times. The server streams the caller’s ledger and finishes each group before applying the visible-row limit, avoiding the former last-30-receipt cutoff. Raw `wallet.get` receipts, balances, settlement and credits are unchanged. CLI/MCP share the new read-only operation and its billing surface link.

The reported production invite URL already returned its title/photo from both stage backends. The frontend was suppressing cards for native links. Native URLs now render ordinary metadata cards, with internal route navigation in the current workspace; cross-stage links remain external. Existing anonymous/public preview projections and SSRF boundaries are unchanged. Posts use Log-style paste/Add controls, removable preview cards, Enter-to-add, deduplication and a three-URL limit. A valid unsaved link is included on Post, as with Log’s Save. Inline cards exclude already attached URLs.

Validation: 119 image/cache/app checks, 96 billing/image/app checks, and 111 final UI/preview checks passed (overlapping suites), plus the operation-contract checks. The billing backend regression verifies complete groups over more than 30 receipts, latest-three behavior across credits, refunds, zero-cost receipts, reconciliation and caller isolation without changing balances. The supplied invite preview was checked read-only against prod and dev without printing its content.

This image/billing/link-card batch is on cloud dev `20260927172405413`. Build and database health passed; live CLI discovery/schema and read-only `wallet.activity` verified its three-charge limit and valid ranges. Production remains v0.27.3.

The image/billing/native-link batch shipped on explicit production request, followed by the user’s in-flight naming correction: grouped rows are labeled **Agent usage rollup**, while individual charges retain their labels. Final production is **v0.29.1**, `20260927172820480`; dev is `20260927172924146`. The five billing checks passed again. Live production activity verified the exact rollup label and latest-three behavior; assets and API health passed.

Invite share descriptions now list attendees in hangout order, using @handles and falling back to names, followed by imported participant names. This is shared by Open Graph, Twitter card metadata and native link cards. It reads only current member name/handle fields, omits former attendees, and falls back to generic branding after code revocation. Ordinary private hangout links remain generic and notes/bios stay out of share metadata.

Attendee-list invite descriptions passed nine preview/privacy checks and TypeScript, then shipped to dev `20260927173448958` and explicitly requested production **v0.29.2**, `20260927173600978`. The user-supplied invite’s live metadata API and rendered Open Graph description were verified, along with API health.

### Planned Log semantics and reports

The researched proposal is [Log semantic search and personal reports](log-integration/SEMANTIC_SEARCH_AND_REPORTS.md). It recommends a private shared evidence index, exact/hybrid retrieval at current scale, free topic browsing, optional cached paid interpretation, and only then opt-in automatic maintenance with estimates and limits. It records current corpus/host aggregates, primary sources, access/revocation requirements, billing and evaluation gates. This is a plan, not a shipped capability or authorization to start paid indexing/report runs.

### Scaling requirement and audit

[Scaling audit](SCALING_AUDIT.md) documents confirmed small-system limits: 128 live connections per process, broad invalidations, the public 10k-document cap/full rebuilds, owner-wide chat scans, read-time billing folds, Log projection/calendar amplification, shared worker/API processes, local whole-file delivery and attachment-history scans. These are not yet fixed. The semantic/report proposal now requires indexed incremental retrieval and bounded reads, with exact scoring only a bounded fast path/oracle, plus scaling groundwork before reports. No capacity claim, infrastructure change or deployment was made by this audit.

### Scaling work in progress

The active implementation is tracked in [Scaling implementation](scaling/IMPLEMENTATION.md). Live invalidation/projection sharing, bounded billing summaries, scoped Log hydration, shared request limits, process roles, media streaming and calendar virtualization are implemented to differing rollout stages documented there. The full audit is not complete. The user authorized production only once the complete batch is ready, explicitly requesting no premature production deployment.

Log notification titles now identify the actor and current hangout title, e.g. “@user added to Tennis.” Push still uses the subject “Notification” and does not include note or DM text. Pending/resolved invitation actions use the shared pill button treatment. Below 640px the primary chat fills the available width inside its normal gutters.

Scaling milestone: dev is now `20260927205919364`; prod remains v0.29.2. Persistent search, private Log retrieval, memory/instructions, indexed attachment locations, private Spaces delivery and bounded calendar data are implemented on dev. See `docs/scaling/IMPLEMENTATION.md` for actual validation and unfinished work. Do not prematurely ship production. The resized host is 4 GB / 2 vCPU. Dev Qdrant is loopback 7336; dev Spaces has nine verified migrated files with local rollback copies. New calendar contracts must deploy before switching local frontend callers: an earlier frontend/API mismatch briefly made the calendar empty and rejected calendarDay fields. Day selectors must show existing compact tiles immediately, with one muted pill reserving attendee-row height until detail hydration.

The next scaling checkpoint is dev `20260927214247608`, with separate API/worker services and bounded shared run admission. See the implementation log for later local scoped-moderation/orphan-reconciliation changes and the current live connectivity investigation. Production is still v0.29.2. Both production private services are prepared and existing production vectors copied without model calls, but production object migration/app activation has not happened. Keep local Vite/admin processes untouched. Source checks and cloud-isolated integration checks have passed; live embedding connectivity must be verified before finishing the authorized production rollout.

Chat clearing deletes the conversation/provider session state and searchable history, while separately saved agent notes/instructions remain. The confirmation says so explicitly. Source-backed notes whose chat evidence disappeared are excluded from core context.


### Performance review fixes and host migration

All ten findings in [the performance-pass review](scaling/REVIEW-2026-09-27.md) are fixed and shipped as **v0.30.1**. Tests passed: 25 local regressions and 106 isolated database checks. The review document maps each failure to its fix. Production Log semantic search, private agent memory/instructions, bounded notification/contact/calendar reads, incremental billing/storage/retrieval indexes and separate workers are active.

The original host developed intermittent TCP/TLS/SSH/outbound failures. Reboots only helped temporarily. The founder authorized replacement and up to $1 temporary overlap; the new 4 GB / 2 vCPU NYC3 droplet is `newdrugs-recovery` (604194887), `167.172.21.42`. DNS for both app domains now targets it. Source app/worker services are disabled, and old nginx forwards over verified TLS while caches expire. Never restart source workers or point deployment back to that machine. Support ticket 12849848 was explicitly authorized and submitted.

The final frozen database copy restored 4,494 documents with zero failures. All 117 non-TTL collections in prod, dev and shared state matched canonical content hashes before activation. Existing users, balances, sessions, credentials and admin/starter-pool state were preserved. All 537 production local files matched their checksums before cutover and then migrated to private Spaces with read-back verification. All 507 Log source records finished indexing. Source and target never served independent writes simultaneously.

Production is `20260928003152356`; reviewed dev is `20260928005542193`. The downloadable CLI is v0.30.1. Live identity/wallet reads and real hybrid Log search passed; no test social messages/posts or hosted reasoning calls were sent. Some recursive resolvers retained the old address after cutover; direct replacement and fresh US/Germany probes were fast. Retire the old host only after its prior one-hour DNS cache window clears and deletion is explicitly confirmed. See [migration runbook](scaling/HOST_MIGRATION.md) for remaining cleanup.

### Desktop panel layout, v0.30.2

Posts/Friends/Log center their content panel while secondary chat is closed. Opening chat moves content left only enough to let the corner-anchored chat grow toward the main panel width. Sidebar width stays fixed. At narrower desktop widths, available room limits chat and main width; mobile takeover remains unchanged. Browser geometry checks covered 761, 1000, 1200, 1440, 1920 and 2560 pixels, and 87 existing app/dock interaction tests passed. Dev release `20260928005542193`; production release `20260928005650796`.

### Log presentation follow-up, v0.30.3

Desktop Log overlays track underlying panel translation as well as resizing, retaining mounted hangout content. Initial deep-link mounting also resolves its anchor before the parent ref is set. Calendar virtualization retains visited week/image elements until 260 weeks or 512 thumbnails, evicting least recently viewed rows while protecting the viewport. Summary data retains 104 five-week chunks. Retained rows do not enlarge fetch ranges; prefetch still follows the actual viewport. Thumbnail counting is cached between data changes.

Validation: 38 targeted tests passed, including exact image-node retention across roughly one year of scrolling and no repeat requests on return. The final counting optimization passed the 16 calendar-focused checks again. Dev release `20260928010526509`; production v0.30.3 release `20260928010629053`. Public bundles and API/worker health were verified. Owned migration Mongo tunnels on 7338/7339 are closed. Old-droplet retirement remains scheduled for 01:23 UTC with its status in `.data/migration/retirement-status.json`; do not infer completion from the schedule.

### Profile/mobile controls, v0.30.4

Withdraw invitation now uses the existing rectangular secondary profile button treatment. The external Video call control is hidden on narrow/mobile and coarse-pointer layouts; desktop behavior is preserved. A native call system remains a future idea. Both stages were deployed, build/API/worker checks passed, and public production assets matched the build. Production release `20260928011527096`.

### Host retirement complete, September 28

Old Droplet 603479023 (24.144.121.19) is deleted, verified through the provider API after the approved DNS waiting period and fresh DNS/service/health checks. Replacement 604194887 (167.172.21.42) remains the sole live host. Temporary proxy trust is removed, owned migration tunnels are closed, and the temporary extra droplet charge has ended. Private migration exports and diagnostics are retained locally. This supersedes earlier scheduled/pending retirement notes.

### Mobile header scale, v0.30.5

The mobile mode switch and Settings control now retain desktop button/icon sizing. Mobile mode labels stay collapsed, and mobile gutters/glass backing stay intact. Dev and production builds/deployments passed; public assets and API/worker health matched the new production release `20260928012914741`.

### Log image maker and device login, v0.34.1; UI correction v0.34.2

The approved production release brought the previously dev-verified optional device login and the Log image maker from `main` to production. The maker keeps raw layers local through an active entry edit and uploads only its final flattened PNG on Save entry. The Log operation contract now accepts one photo or video plus one voice note per attendee. The Square reference and Logcal source remained read-only. Production v0.34.1 was `20260930134211455`; cloud dev was `20260930134055094`.

The immediate production correction removed the underline from the Agent inbox Automation action and left-aligned mobile drawing-size controls. It shipped as v0.34.2 at `20260930134827130`; cloud dev is `20260930134655256`. The final production API, exact worker heartbeat and required services passed. Public JS/CSS asset bytes matched the local build; public HTML has expected server-rendered page-preview metadata. Public API health passed. No QA hangout, post, DM or paid agent run was created.


## October 1, 2026: v0.39.1 approved audit fixes

Production deployment `20261001204613409` shipped private original-filename metadata with ID names in shared projections/downloads, hidden-profile filtering inside semantic and exact retrieval with the explicit agent override, the centered shared Square text default, and native DM calling guidance. Explore cards now show Hide immediately before Add friend, grouped at the right edge with the shared gap. Existing ID storage paths were already correct and were not renamed. The founder excluded the proposed website draft/publication prompt change.

The build, production API health, exact worker heartbeat and public JS/CSS byte comparison passed. Earlier focused filename/privacy/search checks passed in the isolated test database. Browser control was unavailable for the small action-row visual check; no fresh screenshot or physical-device verification is claimed.


## October 1, 2026: v0.39.2 Messages refinement

Production deployment `20261001210702237` shipped photo/name/preview inbox rows that open directly, preserved invitation notes/actions, and DM identity/call/menu controls in the existing top panel header in place of the Messages title. Mobile calls use an icon-only header control. Back restores the inbox and its generic header.

The prior dev pass included ten focused interaction/history checks and synthetic-data browser inspection at 320px, 393px and 960px. Production build, API health, exact worker heartbeat and public JS/CSS byte comparisons passed.
