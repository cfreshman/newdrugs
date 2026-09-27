# Logcal migration

The user authorized moving Cyrus and Laura’s history from `logcal.app` to their existing production New Drugs accounts on September 27, 2026. The source remains untouched. No source passwords, sessions, push tokens, friend graph, or QR credentials are copied.

The scoped source snapshot contains 504 distinct hangouts: 498 for Cyrus, 291 for Laura, with 285 shared by both. Each source hangout becomes one New Drugs entry, retaining the original date, title, place, notes, links, creation time and anniversary marker. Account membership exactly follows source attendance. A creator who previously left does not regain access.

Other attendees are not created as accounts. Their original Logcal IDs and names remain in `logEntries.migration.historicalPeople`; names can appear as historical context in the private hangout. Linking someone later requires a separate explicit migration, never automatic username matching or signup behavior. `logMigrationIdentities` records only the two explicitly mapped accounts.

Every entry has `migration.source = logcal.app`, `migration.sourceId`, a source fingerprint and version. Every imported upload has its source hangout ID, source URL, media kind and an entry-specific stable UUID. This makes later repair possible without duplicate entries. One original bare-domain link is normalized to HTTPS; original link strings are retained internally. Birthdays import month/day only and never overwrite an existing New Drugs birthday.

## Media and preflight

592 media references were checked. 527 valid assets were prepared: 481 images, 39 audio files, and 7 videos. One video was mislabeled as a JPEG at the source and was identified from its file signature. Images use the normal 512px shorter-side rule without upscaling. Prepared bytes add 22,279,527 bytes to Cyrus and 4,415,167 bytes to Laura, within both existing quotas.

65 references are already broken at the source: 63 purported JPEGs contain S3 XML error responses, and two objects return `NoSuchKey` even with source credentials. They are not imported as fake images. Each unresolved reference is recorded in `migration.missingMedia` with the original URL, original hangout ID, owner and reason. The old source thumbnail migration reads HTTP error bodies without checking success and uploads them as image bytes; no fix or write was made to Logcal.

Private source/plan/media artifacts live under ignored `.data/migrations/logcal-20260927/`, mode 0700 with files mode 0600. The cloud staging directory is `/srv/newdrugs/migrations/logcal-20260927`, outside every public release and upload route. Never commit snapshots or print private notes/media URLs in tool logs.

## Tools

- `scripts/migrations/logcal-prepare.mjs`: validates the scoped export/mapping, downloads only the known source bucket, checks actual media formats, prepares normalized files and a stable plan. Never accesses a database.
- `scripts/migrations/logcal-import.ts`: validates the complete plan, IDs, contribution ownership, target account handles, media hashes and available quota. Defaults to an explicit `dry-run` command. Apply copies verified bytes and commits entries, upload metadata, quota increments, identity mappings, optional birthdays and a migration receipt together in one MongoDB transaction.
- `tests/logcalMigration.test.ts`: isolated-cloud-database verification of ownership checks, no-write preflight, exact-byte staging, quota accounting, metadata preservation and retry behavior. A second apply returns the receipt without duplicating data or overwriting subsequent user edits.

Build the importer with tsup targeting Node 22. Run it on the destination host with the private directory, destination environment file and the expected database name as separate arguments. Never pass database credentials on the command line. The environment path is read inside the process. Dry-run and apply results contain only counts, quota totals and the plan digest.

This is a one-time additive data import, not a background synchronization feature or a new backup service. Future imports/repairs must use the preserved original IDs and be explicitly authorized. There is no automatic account linking.


## Completed import

Applied to `newdrugs_prod` on September 27 after production v0.21.1 was healthy. Verified all 504 entry records against the prepared plan and all 527 physical files against their hashes. The second run returns the existing receipt, with no inserts or quota changes. Final total storage: Cyrus 22,469,533 bytes; Laura 4,466,251 bytes, including their pre-existing files. 43 other historical identities are preserved internally.

The initial copied files inherited an incorrect filesystem owner, producing media read failures despite correct data/hash checks. Ownership was corrected for exactly the 527 imported files to match the production storage directory. Every file was then successfully read and hashed as that non-root storage owner. The importer now explicitly assigns the destination storage owner during staging. Future verification must test service-user readability and an authenticated HTTP download, not only root-level checks.

The populated calendar also exposed that media shared the old 180/minute API limiter. Media now has its own 3,000/minute budget; general API requests use 1,200/minute, while sensitive endpoint-specific limits remain. This avoids image browsing consuming the action budget.
