# Starter credit, notifications and operator access

Guest sessions get no spendable credit. An eligible visitor still sees $1 available in the settings button and the starter-dollar welcome. Signup allocates the dollar atomically with the saved account. Registered accounts, excluding the viewer and explicitly marked internal test fixtures, provide the onboarding count; anonymous sessions do not count.

New starter grants are limited to one per public IPv4 address or IPv6 /64 network across stages. `STARTER_IP_HASH_KEY` is a persistent shared random secret. Only a keyed network fingerprint is stored in users and the shared `starterClaims` collection. Trust is limited to the host's loopback reverse proxy, which appends the actual connecting address. User-submitted addresses cannot override it. VPNs or different networks can still bypass this heuristic; shared homes and networks share one bonus. Signup itself remains available. Missing network/key information fails closed for the bonus. Existing credit is untouched. An exhausted pool doesn't consume a claim; an eligible account can receive credit after replenishment using its signup fingerprint.

## Push

Settings → Notifications → Enable notifications opts this device into invitations and direct messages. On iPhone/iPad, use an installed Home Screen app on iOS/iPadOS 16.4 or later. Permission is requested only on a deliberate tap. Other browsers use feature detection. No email or Apple developer account is required.

`VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` are persistent keys generated once per stage with `web-push.generateVAPIDKeys()`. `VAPID_SUBJECT=https://druggie.org`. Never rotate these during normal releases: existing subscriptions depend on them.

The service worker only handles push/clicks, not caching. Payloads say a message or invitation arrived, without private text. Clicking reopens the exact conversation in a live app, preserving its launcher history, or opens a new window. The server owns subscriptions by account, device and session. Logout/account switching revokes the prior session's devices. There are at most eight enabled devices per account. `push.devices` and `push.revoke` expose manual device management through the ordinary CLI/MCP; enabling OS permission is necessarily human/browser-only.

Delivery uses a transactional outbox, checks read state, blocks and live sessions before delivery, retries transient failures, remembers successful devices, and revokes expired subscriptions on provider 404/410. Message bursts collapse to the latest unread message; notification tags group each conversation. A provider acceptance is not a guarantee of device delivery. A crash after provider acceptance but before recording it can repeat a delivery; tags collapse its visible entry. Outbox rows expire after a day. New notifications never contain message text on a locked screen.

References: [WebKit Home Screen Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [web-push](https://github.com/web-push-libs/web-push).

## Operator CLI

Operator keys are separate from social access tokens, browser owner sessions, and the hosted agent. They are issued through the trusted host console, stored server-side only as SHA-256 hashes, and bound to dev/prod stages. No public key-creation endpoint exists. The private local `~/.config/newdrugs/admin.json` has the same 0600 protections and named profiles as ordinary CLI credentials, without migrating or sharing a social token. Uninstall removes both stores.

After loading a service environment on the host, `node bin/create-operator-key.mjs dev,prod 'Cyrus CLI'` emits a one-time JSON credential to a private pipe/file; it refuses an interactive terminal. Import only its token through `newdrugs admin login --token-stdin --url SITE --profile NAME`. Do not put it in arguments, shell history, logs, or a chat. No frontend is needed.

Discover commands with `newdrugs admin search`, then read schemas with `newdrugs admin describe OPERATION` before invoking them. Start with `reports.list`, `reports.get`, or `starter.pool`. `reports.review` records a decision and note, without implicitly deleting content or banning anyone. Operator writes require `--yes` after reviewing the exact action and an individual idempotency key. Every write is audited. `keys.list` exposes labels and IDs, never secrets; `keys.revoke` revokes a selected key. Create replacements through the host console. Operator endpoints reject ordinary CLI tokens and stage mismatches; ordinary social/MCP endpoints reject operator keys.
