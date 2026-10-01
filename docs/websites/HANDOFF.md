# Personal websites

Native personal websites are in production v0.37.1. The owner published a site on cloud dev after that release; no owner site is published on production. Source references are read-only: `../minnow`, `../pangaea`, and `../wayfinder`.

## Product decisions

- One website belongs to one saved New Drugs account. It is separate from the human-authored profile and private Log.
- The existing Agent chat, already on GPT-6 Luna, asks for a brief when needed and edits the site through the shared operations. External CLI/MCP agents can make precise edits directly without a New Drugs model call. There is no fifth tab or separate builder dashboard.
- Drafts have revisioned HTML/CSS/JavaScript files, up to ten recoverable revisions, and a stable preview URL that updates on edits. `pages/index.html` is `/`; additional `pages/*.html` provide other routes. Source media may be inline SVG or any supported ready upload the person owns, including Profile, Posts, Chat and Log media. `website.asset.add` creates an ID-based asset path with the real file extension and returns its preview URL. Media appears under Websites in Storage, and deleting an upload removes its draft and published references.
- Publish is a separate reviewed action bound to the current revision. Later draft edits do not change the published snapshot. A published site adds a Website link to its owner's profile.
- The friendly hostname is `username.druggie.org`, mapping permitted username underscores to DNS hyphens. `u-<code>.druggie.org` is a permanent address independent of username changes. New and renamed usernames cannot start with `u_`, reserving the `u-` hostname prefix for codes. Existing `u_` accounts can still sign in and use the permanent code address for a site. Ordinary usernames beginning with the letter `u` remain valid. Old username hostnames are not permanent aliases. Platform-reserved names use the code address.

## Reference choices

- **Minnow:** chat-first personal site brief, one live-updating draft preview, publish and unpublish. Do not copy its independent account, OpenRouter chat, or deployment stack.
- **Pangaea:** account-owned static personal sites, a stable random code and a profile Website link. Do not copy its direct directory upload or mutable filesystem publication.
- **Wayfinder:** revisioned project files, exact text replacement, preview distinct from publication, recovery and agent tool use. Adapt its organization/Convex model to one New Drugs account and the existing hosted Agent session.

## Current implementation

The shared catalog has `website.get`, `website.create`, `website.file`, `website.search`, `website.patch`, `website.asset.add`, `website.asset.remove`, `website.revisions`, `website.restore`, `website.preview`, `website.publish`, and `website.unpublish`. The existing CLI and MCP expose these operations. Draft and published source are separate Mongo snapshots. Source and uploaded asset paths are validated, and writes require the current revision. The profile button is present only while published.

The dev UI uses `http://localhost:7330/api/website-preview/<token>/` and `http://localhost:7330/api/website-published/<code>/` through the existing Vite proxy. Relative `../styles` and `../assets` links in draft HTML are rewritten beneath the preview token path. The owner’s pre-existing dev draft asset was migrated to its ID path without publishing the draft. They are site content, not a new app frontend. Site responses carry a CSP sandbox without same-origin privilege because user-authored JavaScript shares the `druggie.org` registrable domain. Drafts are unlisted and noindex. The server routes public site requests before app routes so sites cannot reach app API paths through their own hostname. Current site source has a 2 MiB text limit, at most 100 files and 50 pages. Uploaded media uses the existing 64 MiB account upload quota.

Use `APP_ENV` to select dev versus production site URLs and wildcard routing. Both cloud services set `NODE_ENV=production`; dev has `APP_ENV=staging`. The six focused website checks cover revision conflicts, private drafts versus published snapshots, owned media attachment and deletion, sandboxed preview responses, reserved usernames, and username/code routing after a rename. Three earlier focused Storage checks passed; a later combined run passed the website checks and two Storage checks but one older Storage case timed out over the Mongo SSH tunnel. Live localhost HEAD reads for the owner’s draft HTML, CSS and image returned 200 with cross-origin resource headers. A fresh browser visual pass and live model-driven creation have not yet been verified.

## Builder capability follow-up on cloud dev

After the founder found that the initial builder lacked Wayfinder-level tools, dev deployment `20261001143334742` added `website.icons.search/get` over the installed Phosphor catalog and exact regular/light/bold/fill/duotone/thin SVG assets. The hosted Agent is instructed to use Phosphor for website icons and to build a complete responsive site from a brief rather than a placeholder. `website.checkpoints` plus create/file/restore/delete preserve up to three named snapshots beyond the rolling revision history. `website.source.open/list/read/search` safely inspects a selected public HTTPS page, stylesheet or script with bounded owner-scoped snapshots and media/resource outlines. `website.media.import` imports one selected public JPEG/PNG/WebP into the owner’s 64 MiB storage quota and returns an ID-based site asset URL. It does not import videos, fonts or a whole source site automatically.

The focused website, icon and source checks passed. Live dev CLI reads returned an actual installed Phosphor globe SVG, and the new source/import operation contracts are discoverable. A full hosted Agent site-edit turn using these tools and browser visual review remain to be verified. Production v0.37.1 still has the earlier website operation set; this follow-up has only been deployed to cloud dev.

## Production DNS and TLS

The founder authorized production deployment. Production v0.37.1 is deployment `20261001135731211`; cloud dev is `20261001143334742`. The DigitalOcean zone now has wildcard A record `* → 167.172.21.42` (record ID `1834085101`), with exact `dev` unchanged. DigitalOcean documents that exact records take precedence over wildcard records: [DNS record guide](https://docs.digitalocean.com/products/networking/dns/how-to/manage-records/).

The host has `python3-certbot-dns-digitalocean`, a separate `druggie-sites` certificate for `*.druggie.org` expiring December 30, 2026, and an enabled Certbot timer. A DNS-01 renewal dry run succeeded. `scripts/nginx-sites.conf` is installed as a separate wildcard virtual host; nginx config test and reload passed. It strips Cookie and Authorization headers before proxying to production. The existing app/dev virtual hosts and certificate remain intact. An existing DigitalOcean DNS credential was copied to `/etc/letsencrypt/digitalocean.ini` with root-only mode 600; its exact scope has not been independently audited, and the token value was not printed. No new credential was generated.

Public DNS resolution and TLS verification pass for a wildcard label. Unknown code/draft labels and app API paths under a site hostname return 404, while `druggie.org/api/health` and `dev.druggie.org/api/health` return 200. The owner published a dev site at draft revision 7; its dev profile projection now has a localhost Website link. No real production personal site is published yet, so positive production hostname serving still awaits publication. A draft alone does not add a profile button. Production preview hosts use `draft-<random-token>.druggie.org`; the code host is `u-<code>.druggie.org`.
