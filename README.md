# New Drugs

Made in New England. Meet people nearby, share posts and make plans through direct controls or your own agent.

Development uses the cloud dev API and database. Start your own local frontend with:

```sh
npm run dev:web
```

Vite uses `127.0.0.1:7330`. It proxies the maintained HTTPS dev backend with a server-side development key. The dev domain serves authenticated API/MCP only, without a public frontend. There is no local MongoDB or local API server to start. Local environment files and connection tokens are ignored by Git.

```sh
npm run check
npm test
npm run deploy:dev
```

Tests require the private `.env.cloud-test` connection to the isolated `newdrugs_test` database. They refuse to clear other databases. Deployment builds the browser, separate admin frontend, server and downloadable CLI. "Deploy" means dev. Production deployment is an explicit separate action and is the only action that bumps the public version.

The hosted model is `gpt-6-luna` with medium reasoning. Hosted tools, CLI and MCP share one operation catalog. External operations do not spend user AI credit. Profile text and photos are human-authored.

The standalone CLI is available from the app's Connect an agent screen. Named connections are optional:

```sh
newdrugs update
newdrugs uninstall --yes
newdrugs profiles
newdrugs --profile dev read identity.get
newdrugs --profile personal search "find people nearby"
newdrugs file-upload ./notes.txt
newdrugs file-download <file-id> ./downloaded-notes.txt
newdrugs read people.search '{"query":"photo walks","scope":"nearby"}'
```

Without a URL or named profile, a new login uses the public website. Tokens can be supplied through stdin and are stored privately. Never put tokens in command arguments or logs.

Read [implementation status](docs/implementation-status.md), the [reactivity plan](docs/reactivity-plan.md), and the [semantic implementation](docs/semantic-search-implementation.md) and [research plan](docs/semantic-search-plan.md). Wayfinder and Pangaea are read-only references, never deployment targets for this repository.

Installed copies follow Wayfinder's version-based daily auto-update behavior. Downloads are checksum verified, older/equal versions are ignored, and an updated CLI takes effect on the next invocation. `newdrugs update` checks immediately. Source checkouts never self-overwrite or self-uninstall. `newdrugs uninstall --yes` removes the installed package, its standard Codex/Claude Code MCP registrations and all locally saved connection profiles; it does not delete the website account. An older CLI without this updater needs one reinstall to acquire it.
