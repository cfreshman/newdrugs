# Make through operations

Make drafts live on the New Drugs server, scoped to their owner and expiring after seven days. CLI and MCP use the same operation catalog and the same draft IDs. No local CLI draft directory or separate Make API exists.

1. `make.create` creates an empty draft or accepts a complete Square project.
2. `make.get` returns the current project and revision. `make.edit` replaces that complete project using the revision, so concurrent edits cannot silently overwrite each other.
3. `make.render` returns a 512px PNG and SHA-256. It changes neither the draft nor the hangout. MCP returns an image block; CLI JSON includes base64, or `newdrugs read make.render '{"draftId":"..."}' --output preview.png` saves a PNG and prints metadata.
4. `make.publish` takes the draft ID, revision, render SHA-256, hangout ID and, when replacing an existing image, its exact file ID. It renders again, verifies the SHA-256, uploads through the existing Log media path, changes only the caller's visual contribution, preserves their note and voice note, and deletes the draft after the Log save. The result includes the current hangout and an exact link.
5. `make.discard` deletes an unused draft.

Images in a project can be embedded PNG/JPEG/WebP data URIs. For normal source photos, use the existing `file-upload` flow and set the image layer's `src` to `file:<owned-upload-ID>`. Make embeds the owned pixels in the server draft. It does not fetch arbitrary URLs. A caller can pass a JSON file as an operation argument with `@project-input.json`, avoiding long shell arguments. An external agent can use the same operation contract through MCP without local draft state.

The renderer shares the Square painter with the browser and uses Skia canvas in Node. Font files are pinned from Google Fonts in `assets/square-fonts/`. It approximates the browser's rendering; inspect the PNG before publishing. A published image is flattened to one Log visual attachment.
