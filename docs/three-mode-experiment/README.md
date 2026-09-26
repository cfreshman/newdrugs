# Three-mode experiment

Requested September 26, 2026. This is an implementation experiment, not an approved production rollout.

## Baseline and rollback

The complete pre-experiment app is checkpointed locally at commit `4660e6f` and tag `pre-three-mode-20260926`. Work happens on `experiment/three-modes`. Production v0.12.1 is untouched unless the user explicitly requests a production deploy. Returning to the baseline branch restores the old UI; new data models must remain additive so earlier clients continue to work.

## User direction

Agent, Friends and Posts are primary modes selected with a three-way control near the top left. Each owns the main screen. Agent chat is secondary in Friends/Posts, not a permanent dominant column. Posts should seriously adapt Pangaea's complete reading/writing experience; Friends should become a visual, human-authored discovery experience. Keep New Drugs' own branding and privacy/economic choices.

Investigate ordinary ChatGPT access without an installed plugin. A documentation file cannot create networking tools. Explore browser-native site tools and normal browser operation, preserve current account authorization, and never put credentials in links.

## Build sequence

1. Mode shell, mode-specific navigation/state, secondary agent dock, mobile geometry.
2. Posts: purposeful feed layout, composer, share/save, accepted-friends feed, mentions, thread/detail flow, media viewer and draft continuity.
3. Friends: photo-led cards, profile details, useful filters, saved people and clear invitation/message states.
4. Agent: explicit record context handoffs, copy/source controls, file previews and reliable return paths.
5. Ordinary ChatGPT: capability-aware public guide and llms.txt; browser site tools where supported, without a plugin or credential URL.
6. Browser inspection, regression tests, cloud dev deployment, documentation of remaining limits. No production deployment by implication.

No synthetic social activity, generated human profiles, compatibility percentages, engagement coaching, forced swiping, new backup project or billing-policy change. Preserve Phosphor, Noto fonts, square profile photos, 512px image policy, mobile input sizing, safe-area/keyboard behavior and manual control over social actions.

## Current layout decisions

Friends and Posts use the same 680px main-column geometry. The main panel can rise to the top gutter when it clears top controls; side navigation and supplementary information stay lower. The secondary agent fills remaining right-hand space between 320px and 620px, with an overlay when there is insufficient room.

Mobile always uses an icon-only mode switch. The switch is glass over the page background and the Settings glass treatment only when overlapping content. Desktop collapse measures the full expanded switch footprint to prevent oscillation. The mobile secondary agent covers exactly the main content panel, retaining its gutters and top controls and preserves the underlying social screen. Its Agent/X row is a footer near the original opening control. Both mic and launcher are 48px with shared size/radius variables. Chat scrolls through the panel top with no inset, border, or top fade; the panel background shades from white to pale blue at the bottom.

Post browsing filters are All, Nearby, Friends and Saved. My posts remains in the profile timeline. Friends uses accepted connections, not follows, and applies to semantic search as well as chronological browsing. Search hydration rechecks current connection/bookmark state.

The larger Posts, Friends and agent-context work in the build sequence remains in progress. This layout pass does not complete the entire experiment or authorize production.

## Viewer and final polish

Post photos open a shared PhotoSwipe 5.4.4 viewer with Phosphor controls. It uses natural dimensions, focal pinch/double-tap zoom, bounded panning and gallery navigation. Zoomed panning cannot switch photos or close the viewer. Other photos can load independently; closing restores thumbnail focus and leaves the feed mounted. The UI was checked at phone width for fitting, zoom, pan, gallery navigation and focus restoration. Physical iPhone multi-touch was not exercised by browser automation.

Both main and secondary panels share a viewport-fixed white-to-blue gradient. Their bottom edges align on desktop, while the agent retains clearance below top controls. Headers reserve 56px whether or not they contain buttons. Profile photo columns only exist when a photo exists; Unfriend and profile safety controls precede activity. DM reporting is explicitly entered from conversation actions instead of permanent flags on messages. The redundant people-promotion sidebar card is removed.

Image opening explicitly permits upscaling to the contain-fit viewport size, because stored uploads are intentionally small. Background clicks/taps close the viewer; pinch/pan remains protected from accidental dismissal. Re-clicking the active mode or section pops to its base; switching modes preserves each current screen.

Each mode now owns its agent panel open/closed state, composer draft/attachments, scroll and tool navigation. Inactive tool views remain mounted under mode-specific keys. Mobile panels, mode switch and Settings use 6px horizontal insets, with 12px vertical insets and safe-area protection.
