# Log image maker

Shipped to production on September 30, 2026. Current production is v0.34.2 at `20260930134827130`; cloud dev is `20260930134655256`. Source is on `main` at `0d2e3e0` with the later UI correction `04c61b0`. The user approved the production release. The separate Square worktree is an old prototype checkpoint, not the current implementation.

## Behavior

- Make lives in Log new-event and entry editing. The Log form stays mounted underneath it, with date, note, title, place, links, people, cover and scroll preserved. There is no standalone maker route, project export or download.
- The Log media slot retains its image placeholder and vertical action column. Empty: Upload and Make. Uploaded image: Remove and Set cover. Made image: Remake, Remove and Set cover. The made preview reopens the same local layers until Save entry.
- The maker has a persistent top toolbar above a left-aligned square canvas. Palette, context and layer controls sit below the canvas. Mobile/touch uses icon-only compact actions, hides the resize handle and supports one-finger moving and two-finger scale/rotation. Desktop keeps a resize handle inside the canvas. The bottom actions always remain Cancel and Add to Log entry.
- Text placement starts with the Text control, then a canvas tap. The text is centered on that tap. The canvas itself is the live preview during inline typing and after End edit. Tapping outside applies and deselects; End edit retains selection for dragging. Text is human-authored.
- The rich font menu opens up or down according to available viewport space and renders each choice in its loaded face. Extra Google Fonts load only when the maker opens, with individual font files requested when needed. Noto Sans, Noto Serif and Noto Sans Mono remain the base choices. Roboto Mono is omitted.
- Backgrounds are opaque. The rainbow custom-color picker remembers its last chosen value when a preset is used. Clear all requires an inline confirmation. Shadows use X and Y offsets, both defaulting to 24px, without blur or spread. The renderer preserves off-canvas pixels needed for shadows at the frame edge.
- Raw layers and source images remain local through the active entry edit. Add to Log entry generates a local 512px PNG preview; Save entry uploads that final file through the existing Log path and then saves ordinary Log data. Failed saves keep the staged upload for retry. Saving, cancellation, or leaving the editor disposes raw state and unused staged uploads; mode switching alone preserves an ongoing edit.
- UI, CLI and MCP saves allow each attendee one photo or video and one voice note. `log.create`, `log.update` and `log.contribute` enforce this after file authorization and before retaining uploads. No old Log data was migrated or deleted for this rule.

## Validation and limits

Focused Square/Log interaction checks, isolated Log database checks, TypeScript, full builds and both deployment activation gates passed. Local browser review covered 320px, 393px and desktop geometry, shape and text placement, the rich font menu opening above and below, live text rendering, and the made image returning to the retained Log draft. No real Log entry was created as QA. The Chrome extension could not supply a synthetic file through its file chooser, so imported-photo gesture and crop behavior still need a direct device check. Physical multitouch was not proven.

Production API health, exact worker heartbeat, all required services, public API health and published JS/CSS bytes matched the v0.34.2 build. Server-generated page-preview metadata makes public HTML differ from the static template. The immediate prior production release is v0.34.1 at `/srv/newdrugs/prod/releases/20260930134211455`.

Read [REFERENCE.md](REFERENCE.md) for the read-only original Square source. The downloaded private reference remains `/Users/work/dev/personal`; do not edit or run it as part of New Drugs work.
