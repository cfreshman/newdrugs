# Square source inspection

Inspected September 30, 2026. The user's `cfreshman/personal-public` repository is downloaded at `/Users/work/dev/personal`, branch `m`, commit `7de5536bec012c2a389fbfad7ca574f1bb7af807`. It is a private repository despite its name. Keep it as a read-only reference and never print tracked environment files or private data. The download used the saved cfreshman GitHub identity and restored the prior CLI identity afterward.

The live `/square` page was inspected in the personal Chrome profile named Cyrus. Browser IDs can change between sessions; resolve the profile by name instead of reusing an old numeric ID. Its existing draft was preserved.

## Canonical flow

`src/lib/page.tsx` resolves page IDs to `src/pages/<id>`. The main editor is `src/pages/square.tsx` (1,292 lines). `square-angled.tsx` is a separate experimental variant, not the canonical editor. There is no Square-specific backend flow in these files. The editor uses client-side React state and the shared browser store.

- A square canvas holds ordered image/shape, text and drawing layers. Imports are resized to a maximum dimension of 512px without upscaling.
- Image selection supports local files and drag/drop. Shapes use a blank image with a chosen backing color. Text is human-entered. There is one full-canvas drawing layer.
- Selected layers can move, resize, copy, go to the front/back, deselect and delete. Image/text rotation and opacity are editable. The canonical editor hides its resize handle while a layer is rotated.
- Images have a crop region, fit-to-square, center/center-x/center-y, oval masking, backing color, border and shadow controls. Cropping changes both the source region and the layer dimensions.
- Text has content, color, optional backing, font, bold/italic, alignment, outline and shadow controls. Font size fits the layer's box, including wrapped/multiline text.
- Drawing has editable palette colors, four brush sizes (8/16/32/64 at 512px), erase/draw and palette reset. Touch drawing yields to multiple touches.
- Canvas controls include background color/random/transparent and a composition grid. PNG download removes selection/grid from the output, then restores them. Project export/import uses `{entities,color}` JSON. Clear removes layers. Five draft slots exist in source but their UI is commented out.

The reference export uses a remotely loaded html2canvas script and removes a one-pixel edge artifact after rendering. Preserve the intended square output and visible artwork, not that workaround. The angled variant experiments with rotation-aware resize handles and changes some controls; it also drops canonical text outlines and center-axis actions.

## Integration constraints

Device login is complete on dev. The unfinished maker is paused in the Square worktree; read [HANDOFF.md](HANDOFF.md) for the current source and remaining validation. The user wants this before the larger app upgrade.

The latest user scope is Make inside Log entry media options while nothing is attached, alongside Upload. There is no standalone page or download/export workflow. Aim for Instagram Story-quality editing on a square canvas while using New Drugs typography, icons, controls and panel geometry. Keep raw layers/source images and the flattened preview local throughout the active entry edit, permitting re-editing until Save entry. Only then upload the final flattened image through existing Log storage; clear raw components when the edit ends. Do not persist raw projects against the 64 MB account quota. Creating artwork must not automatically publish or edit a profile. Account data and server media permissions remain authoritative.

Bound draft size, layers, decoded media and undo/history if added. Validate imported projects before decoding media, and avoid loading arbitrary remote scripts or trusting imported HTML. Check touch drag/resize/draw, cropping, multiline text, rotation and exported pixels through the actual editor before calling the port complete.
