# Start here: New Drugs

Current operational handoff, verified September 29, 2026. Read this and `AGENTS.md` first, then the relevant sections of [the operating guide](OPERATING_GUIDE.md) and actual source. You do not need the previous conversation. Do not treat historical plans or release notes as current instructions.

## State at handoff

- Product: **New Drugs**, made in New England, at **https://druggie.org**.
- Repository: `/Users/work/dev/newdrugs`; branch **`main`**. Log is shipped production work on the canonical branch. Do not reset to a pre-Log tag or assume Log is unshipped.
- Production is deployed from `main`. `release.json` is the authoritative public version; inspect the live `prod/current` symlink only when an exact deployment ID matters.
- Cloud dev carries current development behavior without bumping the public version. Inspect the live `dev/current` symlink only when an exact deployment ID matters.
- The latest requested implementation is committed and deployed to cloud dev only. Production remains on the prior public release, and no production deployment is authorized. Inspect `git status` for subsequent work.
- Both APIs, both workers, both search services, Mongo and nginx were active at this handoff; both database-backed health endpoints passed.
- **No production deployment is authorized or queued.** Continue from the user's next request. Deferred ideas are not permission to start or deploy projects.

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

The scaling review's ten defects were fixed with 25 local and 106 isolated database checks. Later layout checks passed 87 existing interaction tests; Log retention/modal work passed 38 focused checks. The latest cloud-dev batch passed 138 focused UI checks, 4 isolated agent-memory database checks, a full build, desktop browser inspection, and exact API/worker health verification. Mobile-width browser inspection was not rerun after the user asked Codex to stop controlling Chrome. These counts overlap and are not a current full-suite or million-user benchmark.

Remaining limits, not an automatic task list:

- No measured large-corpus/concurrent-user capacity envelope or high availability claim. Use `docs/SCALING_AUDIT.md` for evaluation requirements, not as an unfixed-bug list.
- Full physical iPhone camera/keyboard/recording/pan-zoom verification still needs a device. Emulation is not proof.
- Migration preserved 65 already-broken Logcal source media references; do not invent replacement media or rerun imports blindly.
- Native video calls, groups, automatic paid reports, multimodal content search and backups are deferred unless separately requested.
- Do not contact DigitalOcean Support again without authorization. Existing ticket 12849848 was authorized; the original host fault was not proven, but the workload moved and the faulty host is gone.

For detailed workflows use [OPERATING_GUIDE.md](OPERATING_GUIDE.md). For what happened historically, use [OPERATING_HISTORY.md](OPERATING_HISTORY.md). Keep this handoff short and current; append history to the history file, not to the operational snapshot.
