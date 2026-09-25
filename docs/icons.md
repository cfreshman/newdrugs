# Phosphor icon reference

Use `npm run icons -- photo add` (or any words describing the intended icon) before adding an icon. Every result is checked against the installed React package's actual exports. Import the printed PascalCase name from `@phosphor-icons/react`.

The official `@phosphor-icons/core` package provides names, aliases, categories, and descriptive search tags. It does not provide prose descriptions. The metadata is used by Phosphor's own icon search: https://github.com/phosphor-icons/core#catalog.

`docs/phosphor-icons.json` is the generated, importable local catalog. Regenerate it with `npm run icons:catalog` after updating either Phosphor package. This is development tooling; the catalog is not imported into the app bundle.

For example, `CameraPlus` is a real React export with the tags photography, pictures, album, and add. `ImagePlus` is not a Phosphor React export.
