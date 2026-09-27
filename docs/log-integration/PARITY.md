# Logcal to Log

Source audit: `../logcal/app/components/{Calendar,LogEntry,HangoutView,HangoutFeed,Filter,Settings,Quiz}.tsx`, `app/lib/{filter,filter-storage,api}.ts`, and `backend/src/{models,routes}`. Reference remains untouched.

## Native core

- Logcal’s continuous calendar: current week first, progressively older weeks below, 52-week fetch batches with no first-entry cutoff, month/year labels in the margin, square day mosaics, and empty-day creation. Tapping a day with several entries opens its chooser. Today and month jumps are shortcuts within that history. The four-wide gallery keeps its contact-sheet geometry and day markers; the list remains optional.
- Dated moments and future plans: optional title/place, links, anniversary marker, and each participant's own note, images, and audio. Date-only records do not shift across timezones.
- Entry details, editing, removal, contribution ownership, cover choice, and adjacent navigation.
- Server-backed filters and named saved views. Search matches titles, places and contribution notes; supports quoted phrases, AND, OR and negation. Search is private, independent from public discovery.
- Recurring anniversaries and birthdays as explicit Log entries, without introducing a second public profile. Calendar recurrence uses month/day, with leap-day anniversaries on February 28 in non-leap years.
- Portable JSON and readable text export with bounded pagination. Media stays access-controlled; export is not a new public sharing URL.

## Adaptations

- Existing New Drugs identity, accepted friends, uploads/quota, notifications, routing, agent tools and live updates replace Logcal's independent infrastructure.
- Sharing is explicit. Invite an existing friend into an entry; they accept before appearing as a contributor. No automatic friendship creation or removal. Shared members can update common details and only their own contribution. The creator can delete the shared entry; others can leave, removing their contribution and access.
- Private first. No public feed publication, public semantic indexing or guessed location. Place is an optional human-chosen diary label, not device coordinates or a discovery location.
- Saved views live with the account, rather than only local storage. Current arrangement/month/draft stays with the Log workspace.
- Images follow the existing 512px shorter-side rule and 64 MB account quota. Audio and short video use the same upload ownership and quota system. Uploaded media must have verified supported signatures.
- Background agents require a separate explicit Log read permission. Existing social-activity permissions do not grant diary access.
- CLI/MCP use the same schemas, authorization, exact links, confirmations and idempotency as manual controls. Writes to private notes need no publication review; inviting another person and deleting shared data do.

## Intentionally omitted

- Independent accounts, passwords, friends graph, notification inbox, app-wide themes, fonts, native push/S3 configuration and Expo shell: already supplied by New Drugs.
- Group accounts and automatic group membership: social groups remain deferred; individual sharing covers the core diary use case.
- Personality quiz: a separate social game, not part of the diary workflow.
- Anonymous join-key URLs and auto-friending: replaced by authenticated, revocable membership.
- Exact GPS reverse geocoding: incompatible with New Drugs' coarse-location policy.
- Life-quarter age labels: require storing a full birth date for a decorative feature. Explicit birthday/anniversary entries provide meaningful reminders without a new profile field.
- Standalone HTML microsite export: portable data/text export first; no separate public diary site or competing renderer.

Implementation status, validation evidence and remaining device-testing limits are tracked in PLAN.md.

## UI correction after the first dev port

The user clarified: **New Drugs skin, Logcal bones.** The initial month-grid redesign was not an acceptable adaptation. Major composition and interactions follow the reference screenshots and current Calendar/LogEntry/HangoutView implementations. Existing New Drugs fonts, palette, controls, accounts, authorizations and panel routing remain the shell. The calendar and gallery load older content at the scroll edge, preserve navigation ancestors, and do not stop simply because a year has no entries. Entry images form a compact horizontal strip above date/place/people and notes, with entry navigation at the bottom. The editor starts with media and then title/place/date/participants/note.
