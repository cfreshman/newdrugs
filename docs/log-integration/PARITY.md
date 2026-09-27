# Logcal to Log

Source audit: `../logcal/app/components/{Calendar,LogEntry,HangoutView,HangoutFeed,Filter,Settings,Quiz}.tsx`, `app/lib/{filter,filter-storage,api}.ts`, and `backend/src/{models,routes}`. Reference remains untouched.

## Native core

- Logcal’s continuous calendar: current week first, progressively older weeks below, 52-week fetch batches with no first-entry cutoff, month/year labels in the margin, square day mosaics, and empty-day creation. Tapping a day with several entries opens its chooser. Today and month jumps are shortcuts within that history. The four-wide gallery keeps its contact-sheet geometry and day markers; the list remains optional.
- Dated moments and future plans: optional title/place, links, anniversary marker, and each participant's own note, images, and audio. Date-only records do not shift across timezones.
- Entry details, editing, removal, contribution ownership, cover choice, and adjacent navigation.
- CLI/MCP-only filters and named saved views; the generic filtering UI was removed. Search matches titles, places and contribution notes; supports quoted phrases, AND, OR and negation. Search is private, independent from public discovery.
- Anniversary starts mark an original hangout. Birthday settings include an optional private birth year for the owner’s calendar age markers. Shared birthday reminders contain month/day only and include accepted New Drugs friends only. Calendar recurrence uses month/day, with leap-day anniversaries on February 28 in non-leap years.
- Portable JSON and readable text export with bounded pagination. Media stays access-controlled; export is not a new public sharing URL.

## Adaptations

- Existing New Drugs identity, accepted friends, uploads/quota, notifications, routing, agent tools and live updates replace Logcal's independent infrastructure.
- A hangout has peer attendees. New people join by an authenticated QR/code flow. People from existing shared hangouts, plus accepted New Drugs friends, can be selected directly in the editor. No extra invitation/acceptance round trip. Any attendee can share the code and add eligible people. Each attendee owns only their own note/media; leaving removes that contribution, even for the creator. The final attendee removes the empty hangout. Co-attendance makes people reusable Log contacts and permits profile viewing, without silently creating New Drugs DM connections.
- Private first. No public feed publication, public semantic indexing or guessed location. Place is an optional human-chosen diary label, not device coordinates or a discovery location.
- Saved views live with the account, rather than only local storage. Current arrangement/month/draft stays with the Log workspace.
- Images follow the existing 512px shorter-side rule and 64 MB account quota. Audio and short video use the same upload ownership and quota system. Uploaded media must have verified supported signatures.
- Background agents require a separate explicit Log read permission. Existing social-activity permissions do not grant diary access.
- CLI/MCP use the same schemas, authorization, exact links, confirmations and idempotency as manual controls. Writes to private notes need no publication review; adding a person, joining and removing your attendance do.

## Intentionally omitted

- Independent accounts, passwords, friends graph, notification inbox, app-wide themes, fonts, native push/S3 configuration and Expo shell: already supplied by New Drugs.
- Group accounts and automatic group membership: social groups remain deferred; individual sharing covers the core diary use case.
- Personality quiz: a separate social game, not part of the diary workflow.
- Independent friend accounts and automatic New Drugs DM friendship: shared-hangout contacts are derived from attendance instead. QR join links are retained with 128-bit rotatable codes and authenticated preview/join.
- Exact GPS reverse geocoding: incompatible with New Drugs' coarse-location policy.

- Standalone HTML microsite export: portable data/text export first; no separate public diary site or competing renderer.

Implementation status, validation evidence and remaining device-testing limits are tracked in PLAN.md.

## UI correction after the first dev port

The user clarified: **New Drugs skin, Logcal bones.** The initial month-grid redesign was not an acceptable adaptation. Major composition and interactions follow the reference screenshots and current Calendar/LogEntry/HangoutView implementations. Existing New Drugs fonts, palette, controls, accounts, authorizations and panel routing remain the shell. The calendar and gallery load older content at the scroll edge, preserve navigation ancestors, and do not stop simply because a year has no entries. Entry images form a compact horizontal strip above date/place/people and notes, with entry navigation at the bottom. The editor starts with media and then title/place/date/participants/note.

## Corrections to the initial interpretation

The initial accepted-friend-only invitation model was an incorrect departure from Logcal and is replaced. `log.invite` is removed; `log.respond`/`log.revoke` remain non-agent compatibility paths for already-created pending invitations only. No creator-only delete-all operation remains. Existing records need no bulk migration: their attendees and contributions already map to hangouts, and a missing QR key is generated on demand.

The generic Log header is removed. Scan and log float over the calendar; separate current-day cards sit above them, including yesterday before 8am. Detail, editor, code and scan screens use an unclipped top-layer overlay with the underlying page mounted, normal exterior gaps, and full height behind the mode header. New Drugs mode controls and navigation continue to own the outer shell.

The current user corrections also require a top-left Grid, completely fixed clickable weekdays, three horizontal-swipe today-card presentations of equal height, a separate Log settings page, and a Hangouts tab on friends’ profiles. These override older reference-layout details.

## Restored age markers

The user subsequently requested Logcal’s right-margin life-quarter markers. An optional birth year now enables full ages on birthday weeks and 1/4, 1/2, 3/4 markers at three-month milestones. The year is owner-only through log.birthday_get/update. log.birthdays and profiles never expose the year or age. No birth year was backfilled by the original migration.
