# Start here: New Drugs

Current operational handoff, verified September 30, 2026. Read this and `AGENTS.md` first, then the relevant sections of [the operating guide](OPERATING_GUIDE.md) and actual source. You do not need the previous conversation. Do not treat historical plans or release notes as current instructions.

## State at handoff

- Product: **New Drugs**, made in New England, at **https://druggie.org**.
- Repository: `/Users/work/dev/newdrugs`; branch **`main`**. Log is shipped production work on the canonical branch. Do not reset to a pre-Log tag or assume Log is unshipped.
- Production is deployed from `main`. `release.json` is the authoritative public version; inspect the live `prod/current` symlink only when an exact deployment ID matters.
- Cloud dev carries current development behavior without bumping the public version. Inspect the live `dev/current` symlink only when an exact deployment ID matters.
- Production is **v0.33.1**, deployment `20260930040709817`, with the completed Log UI checkpoint `66a7c6f`. Cloud dev carries the separate day-modal hotfix candidate `795345f` at deployment `20260930045725280` without a public-version bump. Inspect `git status` for subsequent work.
- Both APIs, both workers, both search services, Mongo and nginx were active at this handoff; both database-backed health endpoints passed.
- **The first approved UI production deployment is complete. The requested production UI hotfix is held for post-fix mobile touch verification.** Level-up work stays paused on its separate branch/worktree and preview database; no level-up production deployment is authorized.

### In-flight day-modal hotfix

Candidate `795345f` keeps native touch capture on its starting element, ignores descendant capture-loss events, and gives entry swipes the same 700ms release allowance as the working shared media handler. The chooser reserves native vertical scrolling and pinch zoom across its entire card. Its scrim fits the main panel below the mode/settings controls, darkens to 65% black, removes the unwanted dialog focus outline, and gives both 40px arrows 12px gaps from the card and panel edges.

53 focused gesture/day/modal/entry/media checks, TypeScript and the full build passed. Cloud dev API and exact worker PID/heartbeat passed. Before/after visual fixtures were inspected at 393px, plus a scrolling dark-mode chooser at 320px with no horizontal overflow. Local evidence is under ignored `.data/visuals/day-hotfix-evidence/`. These fixtures use actual components with synthetic data and no real account writes.

Baseline day and entry touch swipes both worked in iPhone 16 Pro Simulator Safari on iOS 18.6; this did not reproduce the user's physical-phone failure. The Mac then locked before post-fix native-touch and Safari screenshot checks. Manual unlock has been requested. Do not claim those checks passed or deploy this hotfix to production before completing them. Native media/note detail remains a separate swipe level to verify. Fixture builders are in the hotfix worktree's ignored `.data/visual-hotfix/`, and fixture bundles are served by the existing user-owned Vite from the canonical checkout's ignored `.data/visuals/`; remove temporary served fixtures before the production checkpoint, retaining screenshot evidence.

## Product intent

A social experiment combining an agent, posts, friendship discovery and a private/shared life log. It should help people enjoy their lives, express themselves, find people and make plans. It takes no profit. Hosted AI is billed at cost; external CLI/MCP use is free from New Drugs' side.

Do not optimize for likes/replies/reach by default. Profile text/photos are human-authored. Users must be able to manage core social tasks manually. No generated profile prose, invented compatibility scores, fabricated activity or generic engagement coaching. No em dashes in agent-composed prose.

The primary tabs are **Agent, Posts, Friends, Log**, each with preserved independent navigation, drafts and side-chat state. Read `AGENTS.md` for the accumulated interaction decisions before changing a surface. Match the existing UI instead of redesigning adjacent features.

## Environment and authority

**Only live host:** `newdrugs-recovery`, DigitalOcean **604194887**, **167.172.21.42**, NYC3, 4 GB / 2 vCPU. The old host **603479023 / 24.144.121.19 was deleted**. Migration, object-storage activation and old-host retirement are complete. Do not recreate or connect to the old host.

Approved base: $24/month droplet plus one $5/month Spaces subscription, before overages/unrelated account charges. Dev and prod use separate private buckets within that subscription. No CDN, paid backups or load balancer was added.

| Purpose | Location |
| --- | --- |
| User-owned frontend | localhost:7330, `npm run dev:web` |
| User-owned admin frontend | localhost:7334, `npm run dev:admin` |
| Prod API/web | Host loopback 7331, `newdrugs@prod` |
| Dev API/MCP | Host loopback 7333, `newdrugs@dev` |
| Mongo replica set | Host loopback 7332, `newdrugs-mongo` |
| Background processing | `newdrugs-worker@prod`, `newdrugs-worker@dev` |
| Qdrant | Host loopback prod 7337 / dev 7336, `newdrugs-search@prod` / `newdrugs-search@dev` |
| Releases | `/srv/newdrugs/{prod,dev}/{current,previous,releases}` |
| Stage secrets | `/etc/newdrugs/{prod,dev}.env`, private, never print |
| Persistent stage files | `/var/lib/newdrugs/{prod,dev}` |

Do not start, stop or restart local Vite/admin processes. There is **no local API or MongoDB**. Local Vite proxies to gated cloud dev using a private server-side header. `dev.druggie.org` intentionally serves no public frontend. Hosted agent MCP must remain reachable through its authorized HTTPS path.

```sh
ssh -i /Users/work/.ssh/newdrugs_do \
  -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes \
  root@167.172.21.42
```

After SSH, safe basic checks are `readlink /srv/newdrugs/prod/current`, `systemctl is-active newdrugs@prod newdrugs-worker@prod`, and `curl -fsS http://127.0.0.1:7331/api/health`. Check every required service, not merely whether any one unit is active. Public health is `https://druggie.org/api/health`.

## Development and shipping

1. Inspect branch/status/release metadata and the relevant source. Reference apps are read-only: `../wayfinder` for agent/CLI/MCP, `../pangaea` for social UI, `../logcal` for Log. Never edit, test, restart or deploy those apps.
2. Make the requested change using existing components/tokens. Operations use shared schemas, source authorization, idempotency, exact links and reactive invalidation. Do not invent a parallel domain API.
3. Run appropriate focused checks. `npm run check` checks TypeScript. `npm run build` builds all artifacts. Small reversible visual changes do not need invented implementation-mirroring tests.
4. `npm run deploy:dev` deploys completed changes promptly. The user tests with their local frontend. **Only an explicit production request authorizes `npm run deploy:prod`.** A finished prior release does not authorize the next one.
5. Inspect the deploy exit status, API and exact-process worker health. For prod UI changes, verify public HTML/JS/CSS matches the build. Update current docs and commit meaningful completed work.

The deploy script locks concurrent deploys, builds the working tree, uses separate stage releases, rolls back failed activation and verifies the worker PID/heartbeat. Do not change application source during its build snapshot. Do not delete a live deploy lock. Production increments the patch, or minor+patch once for changed operation contracts. Dev never increments the public version. A failed deployment may leave local `release.json` ahead of production; verify before retrying.

Git identity is repository-local `Cyrus <cyrus@freshman.dev>`. `origin` exists, but deployment is not a Git push. If asked to push as cfreshman, `./scripts/github-cfreshman git push ...` uses the saved account and restores the previous account. Inspect remote/branch before pushing; do not switch global auth casually.

## Tests and secrets

Backend integration tests may delete collections. They must target **`newdrugs_test` only**, including shared starter/admin fixtures. `vitest.config.ts` disables real payment/push credentials and parallel test files. Never run separate database-test processes concurrently against the shared test DB; never use dev/prod for fixtures.

Use private `.env.cloud-test` and an SSH tunnel to cloud Mongo when needed. Migration tunnels on 7338/7339 have been closed. A prior isolated cloud validation workspace exists at `/srv/newdrugs/dev/validation/scaling`; its source can be stale, so sync deliberately before using it. Large capacity/load tests do not belong on the shared production host.

Do not dump `.env*`, `.data/credentials/`, CLI config, cloud logs containing private content or migration exports. Temporary DigitalOcean credentials and private recovery artifacts remain under ignored `.data/`. The old-host deletion job is finished; `.data/migration/retirement-status.json` says `deleted`. Do not rerun migration scripts as routine setup. The temporary DO token can be revoked by the owner when no longer needed.

## Current architecture and entry points

React/TypeScript/Vite, Express, MongoDB, private Qdrant, private S3-compatible Spaces. **Not Convex.** Mongo is canonical; retrieval indexes and other read projections are derived.

| Task | Start here |
| --- | --- |
| Shell/modes/routing | `src/App.tsx`, `src/SocialExperience.tsx`, `src/usePrimaryRoute.ts`, `shared/navigation.ts` |
| UI sizing/theme | `src/style.css`, `src/modes.css`, `src/useAgentDockGeometry.ts` |
| Log layout/cache/overlays | `src/LogCalendar.tsx`, `src/useLogCalendarData.ts`, `src/logCalendarRetention.ts`, `src/LogModal.tsx`, `src/LogPanel.tsx`, `src/log.css` |
| Log rules and source authorization | `shared/log.ts`, `server/log.ts`, `server/logContacts.ts`, `docs/log-integration/PARITY.md` |
| Canonical operation contract | `shared/catalog.ts`, `shared/contracts.ts`, `shared/operationContract.ts`, `server/operations.ts` |
| Hosted agent lifecycle | `server/agent.ts`, `server/sessionContext.ts`, `server/agentAdmission.ts`, `server/workerStatus.ts` |
| User instructions / memory slots | `server/agentMemory.ts`, `shared/agentMemory.ts`, `src/AgentMemoryPanel.tsx` |
| Search / authorization / incremental jobs | `server/search/backend.ts`, `retrieve.ts`, `chat.ts`, `log.ts`, `replication.ts`, `worker.ts` in that directory |
| Live updates / notifications | `server/liveState.ts`, `server/privateState.ts`, `server/notificationPaging.ts`, `server/push.ts` |
| Billing / media / attachment indexes | `server/walletActivity.ts`, `server/uploads.ts`, `server/objectStorage.ts`, `server/storage.ts` |
| Deployment and roles | `scripts/deploy.mjs`, `server/index.ts`, `server/config.ts`, `scripts/scaling/` |

The hosted agent uses the OpenAI-hosted Agents API and public MCP. External CLI/MCP calls execute domain operations without starting hosted reasoning. Source currently configures `gpt-6-luna`; check actual source/docs before provider changes. Operation discovery, content search, app navigation and external web search are different things.

Describe schemas before CLI calls. Existing named CLI profiles are normally `default` and `dev`; verify them. Login tokens use stdin, never argv. Read-only checks cost no New Drugs credit. Actual social writes require the user's intended action; do not create activity as QA. Serious writes have exact review; ordinary requested DMs send directly; no bulk operation APIs.

## Recent behavior to preserve

- Log cover selection uses an explicit cover first, then the earliest valid photo timestamp across attendees. Missing timestamps fall back to event participant/file order; equal timestamps use that same order. Full entries, strips, calendar tiles and invite previews share this result.
- Log photos and notes open their own nonblocking native top-layer detail above the retained entry, with contributor/note/voice context, contained media, pinch/pan and swipes. Generic post image viewing remains PhotoSwipe. Strip and detail photos use a shared 4px radius.
- Log footers use New Drugs' shared pill styles. Media has a text-only full-width Download row above Back/Close at a 2:1 width ratio. Back returns to the entry; Close closes the entry. Download and Older/Newer share compact 6px vertical padding; the main action row stays taller. Do not import Logcal's outlined button skin or add a download icon.
- The latest user correction replaces the inline multi-event day panel with a centered mini top-layer chooser. Both mobile and desktop have side arrows and swipes between occupied calendar dates, including single-event days, without wrapping. Date-specific `/log?date=YYYY-MM-DD` links restore the chooser through reload and browser history. Direct single-event calendar clicks still open the individual entry. Log another event is removed by the latest user correction. There is no Close button: outside pointer-down and Escape dismiss the chooser. Events without a photo keep a colored square; only contributor-loading text reserves empty space. Scan and Log new event use the same ordinary New Drugs pill treatment, without a separate primary color. The chooser backing matches the main panel radius and clips its inner surface. The calendar stays mounted with its original scroll; opening a record retains normal full-calendar chronology. This overrides older inline-chooser layout instructions.
- Gesture inventory traced Logcal's active today-card, hangout, media and crop flows plus native horizontal scrollers. Today cards, hangout navigation, media bodies and the day chooser share single-pointer navigation guards, vertical-scroll/selection protection and release-click consumption. Images retain their own pinch/pan behavior. Unused video-trimmer/camera gesture experiments were not ported.
- Closed secondary chat: Posts/Friends/Log main panel centers in the viewport. Open chat: main panel moves only enough to let chat grow to its width, with fixed-width sidenav. Chat stays anchored to the bottom-right. Mobile uses a takeover, not side-by-side panels.
- Open Log overlays track the underlying panel's movement even without a resize. Keep the mounted calendar, entry and drafts intact.
- Calendar retains visited week/image DOM up to 260 weeks or 512 thumbnails, protecting the current viewport. Data retains 104 five-week chunks. Only the viewport drives requests. Do not reintroduce aggressive unmount/reload during ordinary back-and-forth scrolling.
- Mobile top mode/settings controls match desktop scale. Mode labels stay icon-only; mobile gutters/safe areas remain. Mobile hides external Video call. Native calling is deferred.
- Log uses Logcal bones: continuous backward calendar, square mosaics, today floaters, camera scan, QR/code joins and per-person contributions. No generic calendar header or UI filter builder. Birthday year is private; month/day is friend-visible.
- User photos/profile text remain human-authored. Semantic Log search reads authorized text, not image pixels. Public search never includes private Log, chat, DMs or files.
- Persistent public/chat/Log retrieval, user-owned instructions and agent-owned core/non-core slots are shipped. Core notes have bounded pressure/revision/source checks; non-core notes are read on demand. No automatic paid “user report” maintenance was launched.
- Clearing agent chat does not delete separately saved instructions/notes. Invalid source-backed notes cannot silently remain trusted core context.
- Private Spaces is active for new uploads. Existing 537 prod media files were migrated and checksum-verified; local original copies remain for recovery, not as a growing mirror.

## Evidence and remaining limits

The scaling review's ten defects were fixed with 25 local and 106 isolated database checks. Later layout checks passed 87 existing interaction tests; Log retention/modal work passed 38 focused checks. The latest production batch passed 138 focused UI checks, 4 isolated agent-memory database checks, a full build, desktop browser inspection, and exact API/worker/public-asset verification. The subsequent dev Log batch passed 85 focused UI checks, 42 isolated Log database checks and 10 isolated page-preview checks, a full build, live dev contract/API/exact-worker checks and the local proxy. Its temporary test tunnel was closed. Chrome was not controlled. These counts overlap and are not a current full-suite or million-user benchmark.

The day-chooser and gesture follow-up passed 65 focused interaction checks; its subsequent color/dismissal correction passed 42 targeted checks, TypeScript and a full deployment build. Dev API, exact live worker heartbeat and local proxy passed. The requested changes are complete on cloud dev and the approved production checkpoint. Physical-device gesture/geometry validation remains a known limit.

Remaining limits, not an automatic task list:

- No measured large-corpus/concurrent-user capacity envelope or high availability claim. Use `docs/SCALING_AUDIT.md` for evaluation requirements, not as an unfixed-bug list.
- Full physical iPhone camera/keyboard/recording/pan-zoom verification still needs a device. Emulation is not proof.
- Migration preserved 65 already-broken Logcal source media references; do not invent replacement media or rerun imports blindly.
- Native video calls, groups, automatic paid reports, multimodal content search and backups are deferred unless separately requested.
- Do not contact DigitalOcean Support again without authorization. Existing ticket 12849848 was authorized; the original host fault was not proven, but the workload moved and the faulty host is gone.

For detailed workflows use [OPERATING_GUIDE.md](OPERATING_GUIDE.md). For what happened historically, use [OPERATING_HISTORY.md](OPERATING_HISTORY.md). Keep this handoff short and current; append history to the history file, not to the operational snapshot.

## Current UI release and rollback

The final UI candidate passed 95 focused UI/navigation checks, 3 isolated Log database checks, TypeScript and a full build. The database checks exercise nearest occupied dates across a 60-year empty gap, forward/backward ordering with compatible existing cursors, and agent opening of date-specific chooser links. The temporary test tunnel was closed.

Source sanity checks retained the existing button/typography sizes: the calendar actions have 44px hit areas, utility rows remain more compact than main action rows, and Today uses 13px titles/11px names against Logcal's 14px/12px. Preview titles are 14px. These retain the content-space balance and shared desktop/mobile hierarchy; this is a source comparison, not physical-device measurement.

The approved production checkpoint is deployed and verified: all required services, database-backed public API health, exact worker PID/heartbeat and matching published JS/CSS assets passed. The exact rollback release is `/srv/newdrugs/prod/releases/20260930000517890`, **v0.32.1**, recorded by repository commit `209d6d7f7fc16b7ba637f2ed7b31f849b9ef3caf`. Keep that release as the protected previous target. To restore it without resetting this checkout:

```sh
ssh -i /Users/work/.ssh/newdrugs_do -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes root@167.172.21.42 'bash -s' <<'SH'
set -eu
ui_rollback_release=/srv/newdrugs/prod/releases/20260930000517890
test -f "$ui_rollback_release/dist/server/index.js"
systemctl stop newdrugs-worker@prod
ln -sfn "$ui_rollback_release" /srv/newdrugs/prod/current.rollback
mv -Tf /srv/newdrugs/prod/current.rollback /srv/newdrugs/prod/current
systemctl restart newdrugs@prod
systemctl start newdrugs-worker@prod
curl -fsS --retry 30 --retry-connrefused --retry-delay 1 http://127.0.0.1:7331/api/health
ui_rollback_pid=$(systemctl show newdrugs-worker@prod -p MainPID --value)
node --env-file=/etc/newdrugs/prod.env "$ui_rollback_release/dist/server/workerStatus.js" --require-worker "$ui_rollback_pid"
test "$ui_rollback_pid" = "$(systemctl show newdrugs-worker@prod -p MainPID --value)"
SH
```

Reload the browser afterward to load the matching old bundle. This UI batch introduces no database migration to undo; runtime data stays intact.

The final UI checkpoint passed 95 focused UI/navigation checks and 3 additional isolated database checks; the full build passed. Public v0.33.1 assets match the built bundle, with neither Log another event nor Close day present. Production previous still points to the v0.32.1 rollback release above.
