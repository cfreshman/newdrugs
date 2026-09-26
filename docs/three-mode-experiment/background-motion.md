# Ambient background motion

The first pass moved centers by about 1% over two-minute cycles. Against broad, low-contrast fields, that was effectively invisible during ordinary use.

Research:
- [Paper's Mesh Gradient](https://shaders.paper.design/mesh-gradient) exposes distinct color trajectories, organic distortion, speed and pixel-budget controls. Its [source](https://github.com/paper-design/shaders/blob/main/packages/shaders/src/shaders/mesh-gradient.ts) uses differing horizontal and vertical frequencies.
- [Sean Free's ambient backgrounds on Codrops](https://tympanus.net/codrops/2018/12/13/ambient-canvas-backgrounds/) explores smooth procedural motion and rendering techniques for backgrounds intended to remain unobtrusive. These older examples are visual/algorithmic references, not a mobile browser compatibility recipe.

Our tuning decision: retain the current seven-color radial composition and its fixed palette. Move the fields farther along independent, gently irregular paths, with 14–23 second base periods. Use separate slower waves for radius changes so the field does not expand and contract in unison. Keep grain and content stationary.

`--atmosphere-drift` controls center travel and `--atmosphere-spread` controls radius variation. Render at a small raster size at 30 fps; pause while hidden. No extra dependency or pointer-following effect.

Checked the actual app at two points ten seconds apart: the red, green and yellow boundaries visibly changed while the reading surface stayed stationary. Timing and amplitude are product choices, not values mandated by the references.

After user feedback that the first retune remained too subtle, increased drift from 3.6 to 6 and spread from 0.045 to 0.065, while shortening the base periods.

The user requested visible moment-to-moment flow. Current tuning uses drift 10, spread 0.1, and 14–23 second base periods. Verified visible boundary movement in the actual app over three seconds.
