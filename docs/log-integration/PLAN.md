# Log integration

## Approved objective

After shipping the approved agent utilities, adapt `~/dev/logcal` into New Drugs as a native **Log** primary tab. The user wants essentially full parity in the features that matter, with deliberate adaptation and omission of duplicated infrastructure such as user accounts. It must feel like Log inside New Drugs, not an embedded separate app.

## Sequence

1. Finish and verify the utility release on production.
2. Read Logcal's instructions and implementation without editing or running the reference project. Inventory its actual features, data model, interactions and tests.
3. Create a parity map: port directly, adapt to New Drugs, or intentionally omit, with reasons. Account/auth/navigation duplication must use New Drugs' existing infrastructure.
4. Build the native Log experience, backend ownership/permissions, and useful CLI/MCP/agent operations. Keep private Log data out of public discovery unless explicitly designed otherwise.
5. Validate the important flows in New Drugs, maintain cloud dev, and update the operating guide.

The utility production approval does not imply a production release of this new Log project. Local frontends remain user-owned. No Logcal source files, servers or data should be modified.

## Status

Utilities shipped and verified on production v0.19.1 (release 20260926221734638). Logcal inventory is next. No feature-parity conclusions have been made from its name alone.
