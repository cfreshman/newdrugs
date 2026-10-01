# Personal websites

Native personal websites are being built in New Drugs. Source references are read-only: `../minnow`, `../pangaea`, and `../wayfinder`.

## Product decisions

- One website belongs to one saved New Drugs account. It is separate from the human-authored profile and private Log.
- The existing Agent chat, already on GPT-6 Luna, asks for a brief when needed and edits the site through the shared operations. External CLI/MCP agents can make precise edits directly without a New Drugs model call. There is no fifth tab or separate builder dashboard.
- Drafts have revisioned HTML/CSS/JavaScript files, up to ten recoverable revisions, and a stable preview URL that updates on edits. `pages/index.html` is `/`; additional `pages/*.html` provide other routes. Source images may be inline SVG or owned uploaded WebP photos attached one at a time. Website photos appear under Websites in Storage, and deleting an upload removes its draft and published references.
- Publish is a separate reviewed action bound to the current revision. Later draft edits do not change the published snapshot. A published site adds a Website link to its owner's profile.
- The friendly hostname is `username.druggie.org`, mapping permitted username underscores to DNS hyphens. `u-<code>.druggie.org` is a permanent address independent of username changes. Old username hostnames are not permanent aliases. Platform-reserved names use the code address.

## Reference choices

- **Minnow:** chat-first personal site brief, one live-updating draft preview, publish and unpublish. Do not copy its independent account, OpenRouter chat, or deployment stack.
- **Pangaea:** account-owned static personal sites, a stable random code and a profile Website link. Do not copy its direct directory upload or mutable filesystem publication.
- **Wayfinder:** revisioned project files, exact text replacement, preview distinct from publication, recovery and agent tool use. Adapt its organization/Convex model to one New Drugs account and the existing hosted Agent session.

## Current dev implementation

The shared catalog has `website.get`, `website.create`, `website.file`, `website.search`, `website.patch`, `website.asset.add`, `website.asset.remove`, `website.revisions`, `website.restore`, `website.preview`, `website.publish`, and `website.unpublish`. The existing CLI and MCP expose these operations. Draft and published source are separate Mongo snapshots. Source and uploaded asset paths are validated, and writes require the current revision. The profile button is present only while published.

The dev UI uses `http://localhost:7330/api/website-preview/<token>/` and `http://localhost:7330/api/website-published/<code>/` through the existing Vite proxy. They are site content, not a new app frontend. Site responses carry a CSP sandbox without same-origin privilege because user-authored JavaScript shares the `druggie.org` registrable domain. Drafts are unlisted and noindex. The server routes public site requests before app routes so sites cannot reach app API paths through their own hostname. Current site source has a 2 MiB text limit, at most 100 files and 50 pages. Uploaded photos use the existing 64 MiB account upload quota.

Use `APP_ENV` to select dev versus production site URLs and wildcard routing. Both cloud services set `NODE_ENV=production`; dev has `APP_ENV=staging`. The five focused website checks cover revision conflicts, private drafts versus published snapshots, asset deletion, sandboxed preview responses, and username/code routing after a rename. Three focused Storage checks passed. A full browser and live model-driven creation have not yet been verified.

## DNS and production gate

`druggie.org` currently uses DigitalOcean name servers and the app droplet `167.172.21.42`. There is no wildcard A record. The current Let's Encrypt certificate covers only `druggie.org` and `dev.druggie.org`; Certbot's DigitalOcean DNS plugin is not installed. Production nginx has exact app/dev virtual hosts only. Therefore username/code/draft subdomains are **not live** and production must not be released yet.

Prepare a wildcard A record `*.druggie.org → 167.172.21.42` in the existing DigitalOcean zone, leaving exact records intact. DigitalOcean documents that exact records take precedence over a wildcard: [DNS record guide](https://docs.digitalocean.com/products/networking/dns/how-to/manage-records/). Install `python3-certbot-dns-digitalocean` on the existing droplet, obtain a separate DNS-01 `druggie-sites` certificate for `*.druggie.org`, and verify unattended renewal. This preserves the existing app/dev certificate. Install the reviewed `scripts/nginx-sites.conf` wildcard virtual host, proxying only to the production app and stripping cookies and authorization. Keep exact `druggie.org` and `dev.druggie.org` blocks. Use a DigitalOcean token scoped to domain read/create/delete in Certbot's root-only credentials file; never put it in the repository or chat. The plugin is available from the host's package repository but is not installed. Stage and validate nginx/DNS/cert changes only for an explicitly approved production website release.

Production activation order: deploy the reviewed app code first, obtain the separate wildcard certificate with the DigitalOcean DNS plugin, install `scripts/nginx-sites.conf` only after its certificate exists, verify `nginx -t` and renewal, then add the wildcard A record and check DNS resolution. No record or nginx change has been made.

The native site feature remains on cloud dev until a fresh explicit production approval. After DNS and TLS are ready, verify an unassigned label returns 404, both username and code labels resolve to the same published site, a username change moves only the friendly label, draft remains noindex and unlisted, and site scripts cannot read New Drugs cookies or call app actions.
