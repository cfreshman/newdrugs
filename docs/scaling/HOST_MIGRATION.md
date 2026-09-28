# Replacement-host migration

Authorized by the founder on September 27, 2026. Source: `newdrugs`, Droplet 603479023, NYC1, 24.144.121.19. Cutover completed September 28 at approximately 00:23 UTC. The replacement is the sole write authority. Source writers are stopped and disabled; do not restart them.

## Replacement to prepare

- Name: `newdrugs-recovery`, project `newdrugs`, NYC3.
- Ubuntu 24.04 LTS x64, regular Basic 4 GB / 2 vCPU, $24/month, standard included disk.
- Existing New Drugs SSH deployment key. No access to reference apps.
- Same two existing private Spaces buckets, without new storage subscriptions.
- No paid backups, CDN, load balancer, monitoring upgrade or other optional service.

After retiring the old droplet, the base returns to the approved $29/month including Spaces. Keeping both droplets temporarily adds approximately $0.036/hour. Creation and up to $1 of temporary overlap were approved. The founder also approved deleting the exact old droplet after DNS clears, no earlier than September 28 at 01:23 UTC. Deletion remains pending; verify time, public DNS, replacement health and retained migration artifacts before executing it.

## Cutover sequence

1. Verify the replacement independently before copying private data: repeated public HTTPS/SSH checks, outbound provider/Spaces connectivity, gateway/interface health and stable clock.
2. Install the existing runtime versions and scoped service users. Copy private stage configuration, current releases, media, TLS certificates and units through authenticated SSH. Never print credentials or put them in public cloud-init data.
3. Take a consistent database export using root-owned credential configuration, preserving prod, dev, shared starter/admin state, authentication and indexes. Restore on the replacement's loopback Mongo port 7332. Do not create a local development database.
4. Keep replacement workers and public writes disabled while validating the copy. First reproduce the existing production v0.29.2 service, separating infrastructure recovery from feature rollout. Rebuild/copy derived search indexes separately; do not run duplicate agents or scheduled automations.
5. Briefly stop source app/worker writes, export the final database state and sync final media. Restore, verify counts and ownership, start the replacement, and switch public DNS only after direct-IP HTTPS checks pass. Preserve existing cookies, keys, identities and balances.
6. Route requests arriving at the old IP to the new host during DNS propagation, keeping the old database and workers inactive. There must be one write authority. Keep the source intact for rollback.
7. Update local proxy/deployment/SSH target configuration. Verify public page assets, signed-in read-only CLI, media ranges, dev access gating and worker state. Then deploy the reviewed fixes to dev and the explicitly authorized production batch.
8. Retire the old droplet only after successful cutover and a separate concrete deletion confirmation. Remove temporary migration secrets/archives when no longer needed.

## Current status

- Replacement: `newdrugs-recovery`, Droplet **604194887**, **167.172.21.42**, NYC3, 4 GB / 2 vCPU, Ubuntu 24.04.
- Production v0.30.1 is live, release `20260928003152356`. Both APIs, both separate workers, both private Qdrant instances and Mongo are healthy.
- Final quiesced restore copied 4,494 documents with zero failures. Hashes matched across 117 non-TTL collections before target activation. Existing accounts, sessions, balances and keys were retained.
- All 537 production media files migrated into the existing private Spaces bucket with read-back verification and zero failures. Original local files remain for rollback. All 507 Log sources indexed; both indexing queues drained.
- Root and dev A records point to the replacement with TTL 300. The former TTL was 3,600 seconds. The conservative retirement deadline is 01:23 UTC.
- Old nginx forwards to the new host with verified TLS. Verification depth was corrected to 5 after the initial bridge returned 502. The replacement trusts original-client forwarding only from the old IP during this bridge.
- New-host external checks returned 200 in 0.09–0.35 seconds; a probe still resolving the old IP timed out. The founder confirmed fast access. Support ticket 12849848 remains open.
- All ten code-review findings were fixed and deployed, with 25 local and 106 isolated cloud database regression checks passing. This is not a large-scale capacity benchmark.
- Private exports, configuration and manifests remain under local `.data/migration/`; never commit them. Old-host retirement and removal of the temporary forwarding trust remain pending.

### Approved retirement scheduling

The founder approved deletion after DNS clears. A local, detached guarded job is scheduled for September 28 at 01:23 UTC, using the existing scoped API credential without printing it. Private status is `.data/migration/retirement-status.json`, log is `.data/migration/retirement.log`, and PID is `.data/migration/retirement.pid`. It verifies exact old/new resource identities, both public DNS resolvers, authoritative DNS, retained database manifests/export and incident archive, target services, stopped source writers and repeated production health before deleting only Droplet 603479023. It aborts on any failed check or insufficient API scope. Check its actual result; scheduling is not completed retirement.
