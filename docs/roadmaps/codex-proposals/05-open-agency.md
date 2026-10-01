# User-controlled agents and portability

| Field | Value |
| --- | --- |
| Author | Codex |
| Status | **Unconfirmed agent proposal** |
| Founder approval | **None** |
| Implementation authorization | **None** |
| Basis | New Drugs v0.38.1, October 1, 2026 |

## Verified starting point

The CLI and public MCP expose the same catalog of individual domain operations as the hosted Agent. External direct operations do not consume New Drugs hosted-model credit. Device login, named credentials, read/write scopes, idempotency, exact links, the Agent inbox, automations and run-bound background authority exist. The app already separates public search, private Agent chat, DMs and private Log.

## Founder decisions to preserve

No bulk user-operation APIs. A serious social action still uses exact review. An external agent does not gain permission from a prompt, from another agent, or from seeing a returned link. Accepted-friend DMs can be sent directly when requested; publication, invitations, reports and irreversible deletion retain their review semantics. Private profile and Log material do not become public because an external tool can read them.

## Codex hypothesis

New Drugs could become a useful social service even for people who bring their own interface or Agent. The next step may be **more precise delegated access**, rather than adding a new model to the hosted chat. A person could give an external agent short-lived read access to one selected private record or dataset for a specific task, then revoke it. This would make the open control plane safer and more understandable than an indefinitely broad key.

## If the founder selects it

1. Start with one narrow grant type, such as read access to a selected Log entry, created by the owner in Settings or through an exact reviewed operation. Specify credential, record, allowed read operations, expiry and revocation. Do not silently include the rest of Log or other attendees' unrelated records.
2. Recheck the grant, current Log membership and account state at each metadata and media request. A copied URL, old MCP result or cached preview cannot extend the grant. Code-based guest previews remain a separate authorization path.
3. Show the owner a small list of active grants with exact records, credential names and expiry, plus a direct revoke control. Audit reads at an appropriate bounded granularity without retaining private content in logs.
4. Test expiry, revocation during a download, account switch, removed attendance, file deletion and a compromised/revoked external credential. Make the old key fail closed.

Only after a useful narrow grant is proven would broader source-scoped permissions, reactive subscriptions or portable owned-data export make sense. Export of shared DMs and hangouts needs a separate policy for other people's contributions. The [AT Protocol overview](https://atproto.com/guides/overview) shows one model of portable identity and records, but it does not make New Drugs federated or settle those privacy rules.

## What would make this a poor choice

If people cannot understand what a grant exposes, a finer schema may create false confidence. If current read/write keys meet real external-agent needs, permission machinery could be cost without benefit. Portability should follow actual records and shared-ownership rules, not a marketing claim that an MCP endpoint has solved data ownership.
