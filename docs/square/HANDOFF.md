# Paused Log image maker

Paused at the user's request on September 30, 2026. Do not resume implementation until the user asks. Read `AGENTS.md`, `docs/HANDOFF.md`, and this file first. Preserve the current work and the user-owned local servers.

## Latest requested behavior

- This is part of **Log new event / entry editing**, not a standalone Make page or launcher feature.
- With no attachments, the existing media options show **upload** and **make**. No download step or project export UI.
- Make opens a square visual editor inside the existing Log panel. Preserve the mounted entry form, note, date, title, location, links, people, cover selection and scroll beneath it.
- The user expects “instagram story level slide editing quality except a square”: direct touch manipulation, pinch resize/rotation, tap-to-edit text, accessible drawing/color tools, undo/redo and a polished mobile experience. Merely exposing the old Square's raw controls is insufficient.
- Keep the raw layers/source images while this entry edit is ongoing. The made image can be reopened and changed until **Save entry**. Keep both raw data and the flattened preview local during editing, so re-editing does not create repeated uploads.
- Save entry uploads only the final flattened image through the existing Log upload path. Raw components never go into persistent account storage or consume its 64 MB quota. Dispose of them when entry editing ends through save/cancel/dismissal. Mode switching alone should preserve an ongoing edit.
- After saving, the result is an ordinary Log image. No permanent editable projects, new backend store, paid processing, public indexing or automatic publication.

## Repository and running state

- Canonical checkout: `/Users/work/dev/newdrugs`, branch `main`. Device-login completion record is `4be1175`.
- Incomplete Square implementation: `/Users/work/.codex/worktrees/square-editor/newdrugs`, branch `codex/square-editor`, based on `4be1175`. The unfinished source is checkpointed there. Inspect its latest commit/status before continuing.
- Square has **not** been merged into main, built, deployed or browser-validated. The user's local Vite therefore does not yet show it.
- Latest `npm run check` passed after the prototype changes. `git diff --check` passed. No Square interaction tests, renderer tests, build or capacity/physical-touch proof has run yet.
- The worktree has an untracked `node_modules` symlink to the canonical checkout and a private ignored `.env.cloud-test`. Never stage either. No test Mongo tunnel or agent-owned local server is running.
- Production remains **v0.33.3**. Cloud dev has completed device login at deployment `20260930093430907`. Square has no production approval.
- The larger app upgrade remains paused in `/Users/work/.codex/worktrees/app-level-up/newdrugs`. Leave it alone.

## Prototype source

`src/LogPanel.tsx` adds the empty-media make button and a local made-image draft. The original form stays mounted and is hidden/inert while making. Tapping the made preview's Edit badge reopens the retained maker; the multi-file chooser also has Edit for the made image. `Use image` creates/replaces a local Blob URL and draft file reference without an upload. Save entry resolves that local file through `uploadFile(..., 'log_media')`, substitutes the real file/cover IDs, then uses the ordinary Log operation. An uploaded result from a failed save is retained for retry. Successful save/footer Cancel unmount the raw maker. Replaced/unused staged files have individual discard calls.

`src/SquareEditor.tsx` contains the prototype canvas/tools: images, shapes, text, drawing/eraser, palettes, transform gestures, center/rotation snapping, crop, layer order/copy/delete, text styling, undo/redo and local rendering. It is mounted but hidden after Use image so editing can resume. There is no download button or new app route.

`src/squareRenderer.ts` uses one native Canvas renderer for preview and flattened PNG, waits for fonts/assets, bounds the decoded-image cache to 32 entries, and normalizes imported photos to at most 512px without upscaling the source. Final artwork is a 512px square PNG.

`src/squareModel.ts` defines layers, raster-header validation and transform/crop helpers. Current bounds are 32 layers, an 8 MB composition, 1,000 text characters per layer, 20 undo states with a 16 MB unique-source budget, and imported raster limits of 16 megapixels/16,384px before decoding. It still contains unused legacy project import code from the initial standalone concept; remove or justify it since the user subsequently narrowed the flow.

`src/square.css` skins the prototype using New Drugs tokens. It is not visually checked yet.

## Review before calling this ready

1. **Finish raw-data lifetime handling.** Footer Cancel and successful save clear the maker, but external overlay dismissal, navigation/pop and Remove me entirely need auditing. `PreservedPanels` retains visited components, so hidden is not equivalent to disposed. Do not clear an ongoing edit merely because its mode becomes inactive.
2. **Inspect actual geometry and touch behavior.** The resize handle was just moved outside the rotated bounding box and clamped into the canvas. Its CSS still has the old `right:0` positioning and needs centering/sizing review. Replace its Unicode arrow with a verified Phosphor icon (`ArrowsOutSimple`/`Resize` were found by the catalog). Verify no toolbar overflow at 320px/393px, touch targets, native keyboard behavior, crop controls, drawing cancellation, pinch/rotation transitions and one undo step per gesture.
3. **Review prototype races and rendering.** Async image/font preparation, selection changes and drawing-buffer reloads must not leave stale pixels or permanent busy state. Crop/fit/resize must preserve photo proportions and useful positioning. Check transparent output, text wrapping/fonts, outline/shadow/opacity, layer order and actual flattened pixels. The mobile global input font rule may need an intentional override for the text-edit overlay while retaining a minimum of 16px.
4. **Test Log integration.** Make only when empty; local Use image causes zero uploads; re-edit retains raw content; entry fields/scroll stay mounted; final Save entry uploads once; real file and cover IDs replace local IDs; retries avoid duplicate uploads; upload/save failures retain the composition; removal/replacement frees staged media; all edit-ending paths dispose raw data. Do not send layer JSON or source assets to the API.
5. Add meaningful model/gesture/render and Log-flow checks, run the relevant existing suites and TypeScript, inspect the real UI with synthetic data, then build/deploy cloud dev. Do not create real Log events/posts/messages as QA. Database tests, if needed, use `newdrugs_test` only and never concurrent processes. Use CUA for browser testing, not a separate Playwright/CDP driver.

## References and completed prerequisite

Read [REFERENCE.md](REFERENCE.md). The user's private `cfreshman/personal-public` clone is `/Users/work/dev/personal`, branch `m`, commit `7de5536bec012c2a389fbfad7ca574f1bb7af807`. Canonical editor: `src/pages/square.tsx`; `square-angled.tsx` is experimental. Its existing browser draft was preserved. Do not edit/run/deploy the reference or print its environment/private files.

Pangaea's `frontend/src/components/StorySlideEditor.jsx` and Main navigation flow, plus Wayfinder's browser upload validation/hook, were read as references. Do not run their tests or services.

Optional device login is complete **on dev**: the installed cloud CLI received browser approval for @cyrus, verified identity, saved credentials privately (directory 700, file 600), and passed a separate read-only identity check. Ordinary Connected agents revocation then returned HTTP 401, and the temporary saved login was removed. Approval/denial/expiry/polling/revocation tests and full builds passed. PAT/LLM paste remains the default. No localhost callback or bearer token was pasted into chat. Its production release still needs an explicit request.
