# Current infrastructure

Production v0.30.1 runs on **newdrugs-recovery**, Droplet **604194887**, **167.172.21.42**, NYC3, Ubuntu 24.04, 4 GB / 2 vCPU regular Basic at $24/month. Both existing private Spaces buckets share the existing $5 allowance. The intended base is $29/month after retiring the source. The user approved up to $1 temporary droplet overlap.

The original NYC1 host 603479023 / 24.144.121.19 is retained only for DNS forwarding and rollback. Its app/worker services are stopped and disabled. Do not deploy to it or restart its workers. Default deployment targets the replacement. See [migration](HOST_MIGRATION.md).

Production: web 7331, Mongo 7332, dev web 7333, dev Qdrant 7336, prod Qdrant 7337, all on loopback behind nginx where applicable. Both stage workers are enabled. Production migrated 537 verified objects; dev already had nine. Local original media copies remain for rollback. No extra bucket subscription, backup, load balancer or CDN was enabled.

# Infrastructure activation and current host

Updated September 27, 2026. The founder approved the $29/month base. The existing New Drugs droplet was resized to 4 GB / 2 vCPU, keeping its 25 GB disk and IP. Both stage health checks passed after boot. A dev-only Qdrant service is installed and passed a live synthetic contract probe; Dev Spaces is activated; production search/storage are not activated yet.

Before resizing, the host had 961 MiB RAM. The most recent read-only sample showed 685 MiB used, 276 MiB available and 330 MiB swap used. This is a point-in-time observation, not proof of active swap pressure. Keep the current app operational while preparing the new backend; do not add search processes to this 1 GB host or load-test production.

## Recommended first deployment

Resize the existing DigitalOcean droplet to **4 GiB / 2 vCPU**, listed at **$24/month** for the regular Basic plan. Preserve its IP, disk and current stage directories. Prefer CPU/RAM-only resizing where offered so later downsizing remains possible. Resizing may require a short shutdown and needs the founder's approval for the recurring cost and maintenance window. Existing droplet plan details still need confirmation in the account.

Run isolated Qdrant instances for dev (loopback 7336) and prod (loopback 7337), with separate credentials/data directories. `scripts/scaling/install-qdrant.sh` pins official Qdrant 1.19.1 and its published GitHub asset SHA-256, refuses a sub-4-GB host, preserves existing keys, binds only loopback and applies per-service memory/CPU limits. It does not change the app environment or activate production search. The code uses disk-backed dense/sparse indexes and indexed account/location/date filters, with Mongo source checks. This is not a measured 100,000- or million-document capacity claim.

After installation, put the selected stage's loopback URL and its own secret into that stage's root-owned environment file without printing the key. Start on dev, run the contract/privacy/revocation and bounded-load checks, complete incremental backfill, then activate production only as part of the fully validated authorized batch. Existing vectors are copied; unchanged text should not be re-embedded.

## Shared media

A private DigitalOcean Spaces bucket is the planned shared-storage target. Base pricing is **$5/month**, including 250 GiB storage and 1,024 GiB outbound transfer; overages are additional. This brings the proposed base infrastructure to **$29/month**, excluding other existing account charges. Bucket credentials, private access, application-authorized streaming, checksummed migration, rollback and deferred local deletion must be ready before switching it on. The current streaming filesystem path stays supported during migration. Object-store implementation/migration is still in progress.

This first step supports the new architecture and useful headroom. It is not a high-availability deployment. Further API/worker hosts and rolling activation require shared media, private networking and actual capacity measurements. Do not claim scaling is complete just because a larger machine or Qdrant is available.

Sources checked today:
- https://www.digitalocean.com/pricing/droplets
- https://docs.digitalocean.com/products/spaces/details/pricing/
- https://github.com/qdrant/qdrant/releases/tag/v1.19.1
- https://github.com/qdrant/qdrant/blob/v1.19.1/config/config.yaml
- https://qdrant.tech/documentation/inference/inference-bm25/

Verified target: DigitalOcean project `newdrugs` (`3676387a-6101-46ae-9583-f628dd029c32`), droplet `603479023`, public IP `24.144.121.19`, NYC1. The authenticated control panel is in Chrome’s **Cyrus** profile and can be operated through the native `Google Chrome` CUA app. The browser-extension connection exposes a different profile named `wayfinder`; its temporary login tab was closed. No Wayfinder app, code or infrastructure was modified.

The resize was CPU/RAM-only, at the displayed $24/month. Both app stages had zero queued/running agents before a graceful shutdown. After power-on, SSH reported 2 CPUs, 3915 MiB total RAM and both database-backed health checks succeeded. `newdrugs-search@dev` is healthy on loopback 7336. Its private key is in `/etc/newdrugs-search/dev.env`; never print it. The contract probe tested real dense/lexical retrieval, owner filtering and deletion without model calls, then removed its synthetic collections. Production remains v0.29.2.

Dev bucket `newdrugs-cfreshman-dev` is in NYC3 in the `newdrugs` project. One $5 subscription covers multiple buckets; a separate near-empty staging bucket does not add another base fee. File listing is restricted and CDN disabled. The bucket-scoped read/write/delete key is stored only in ignored local `.data/credentials/dev-object.env` (0600) and root-owned cloud configuration. Never display it. Dev now uses S3 for new uploads; all nine eligible existing dev uploads migrated with read-back checksum verification. Local copies are deliberately retained for rollback. Real object-store checks passed authenticated full/range/HEAD reads and anonymous denial. The credential capture through Terminal UI was blocked; the founder filled the prepared private file instead. No broad DigitalOcean API token was created.
