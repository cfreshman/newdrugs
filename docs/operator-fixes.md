# Operator fixes, September 25, 2026

Scope approved after the operator audit: release retention, stable operation reviews/retries, a modest relevance adjustment, unambiguous navigation, observable automation failure/retry, profile timelines, relationship lifecycle and CLI moderation. LLM billing settlement is unchanged. Backups are deferred by the user's direction.

## Deployment artifacts

`scripts/release-retention.py` keeps three recent release directories per stage and always protects `current`, `previous` and `current.next`. Only real directories named with the 17-digit deployment timestamp are eligible. It ignores symlinks and other directories. Deployment invokes retention before building/uploading and after successful activation, with a 1 GiB free-space gate. The initial cleanup removed 55 obsolete releases and recovered approximately 16 GB without restarting a service or deleting application data.

## Reviews and receipts

Each operation has a stable version derived from its validation schema, confirmation policy and explicit semantic revision. Description text and unrelated releases do not invalidate it. Update `semanticRevisions` in `shared/operationContract.ts` for execution changes that are not represented by the schema or confirmation policy.

Successful write receipts use operation/input identity rather than release identity. Known legacy release hashes remain supported for old receipts. An actual changed contract obtains a fresh exact review automatically; rejected actions remain rejected and changed arguments cannot reuse an existing approval.

## Discovery and social UI

Semantic results still do not require keyword overlap. Unsupported semantic similarity between 0.20 and 0.23 is excluded; stronger semantic neighbors and keyword matches retain their existing retrieval paths. There is no popularity ranking or new LLM reranker.

`app.open` distinguishes human `messages`/`connections` from external credentials at `agents`. Existing `/agents` links still work. Profiles contain Posts and Replies using `posts.list` with `scope:public`, `authorId` and `kind`, including chronological pagination and the existing post cards.

Invitation participants and accepted contacts can view nondiscoverable profiles and their selected photos. Ending a connection preserves conversation history and the original invitation but stops sends. The person ending the connection may send a fresh invitation; the other person cannot repeatedly request it. A recipient who declined can later initiate their own invitation. Reopening still requires acceptance. Outside those visibility grants, private profile details are not exposed through connection-history reads, and inaccessible profile buttons are disabled.

## Automation observability

Insufficient credit defers admission and retries after a minute. The UTC daily allowance retries after its next reset. Service failures retry automatically. The automation remains enabled, with `blockedReason`, `blockedCode` and `retryAt` returned through UI/CLI/MCP. Deferral notices are deduplicated for the same occurrence; recovery gets a notice too. Revoked authority pauses and notifies. A failed run, missing delivery decision or spending-limit stop also notifies. Successful silent work remains quiet.

Notifications link directly to the automation. People who enable agent-update push receive a generic automation notification on their enabled devices. Run history supports older pages and identifies pending usage rather than presenting it as settled zero cost.

## Moderation through the operator CLI

No new admin frontend is added. Discover and describe each operation using the separate operator login:

```sh
newdrugs --profile dev admin search
newdrugs --profile dev admin describe reports.get
newdrugs --profile dev admin describe posts.moderate
newdrugs --profile dev admin describe users.suspend
newdrugs --profile dev admin describe reports.moderate_message
```

- `posts.moderate {postId, hidden, reason}` hides/restores one post without erasing evidence. Hidden posts leave feeds/search and lose public attachment access; an exact thread can show a removed-parent stub. Author deletion remains final.
- `users.suspend {userId, suspended, reason}` hides the person's public content, terminates sessions, revokes agent credentials, pauses automations and cancels work. Restoration does not reactivate credentials or tasks.
- `reports.moderate_message {reportId, hidden, reason}` hides/restores only a message explicitly submitted with that report. It grants no general conversation access.
- `reports.files {reportId}` lists photos attached to the reported post. `admin file-download <report-id> <file-id> <destination>` downloads only those evidence files to a new private local file. Deleted source files can become unavailable.
- `reports.review` records the case decision separately from enforcement.

Every operator write requires `--yes`, a specific reason where applicable, and an individual idempotency key. Writes are audited and stage-scoped. Revocation and suspension serialize with mutations. User-facing report controls can attach one specific post or received message. A DM report explicitly tells the user that the selected message will be shared; other messages remain private.

## Validation and rollout

Deployed to cloud dev as release `20260925214114039`, retaining the public version `0.11.1`. Production application code was not deployed in this pass. The initial artifact cleanup applied to both stages and reduced root disk use from 93% to 28%.

Type checking and production builds passed. The broad regression run passed 224 cases; its remaining old-component UI assertion passed in the final affected-UI rerun, which passed all 66 cases and included an additional live-refresh regression. Live dev CLI checks verified the separate human/agent destinations, author posts/replies filters, semantic retrieval, automation/notification reads and the new confirmed operator contracts. Both stage health endpoints returned 200. No real account was moderated and no social messages or posts were sent during validation.

Production rollout was subsequently authorized and completed as **v0.12.1**, release `20260925214920221`. The public frontend, API health and separate human-connections/agent-settings routes were verified after activation.
