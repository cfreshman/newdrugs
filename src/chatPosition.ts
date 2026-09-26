export interface Point { x: number; y: number }
export interface Viewport { width: number; height: number; left: number; top: number }
export interface ChatDimensions { width: number; gutter: number; radius: number; bottomGutter?: number }
export function mobileChatLayout() { return innerWidth < 640 || window.matchMedia('(pointer: coarse)').matches; }
export function clampChat(point: Point, viewport: Viewport, composerHeight: number, dimensions: ChatDimensions): Point {
  const { gutter, radius } = dimensions;
  const half = Math.max(0, Math.min(dimensions.width, viewport.width - gutter * 2)) / 2;
  const maximumY = viewport.top + viewport.height - (dimensions.bottomGutter ?? gutter) - radius;
  const minimumY = Math.min(maximumY, viewport.top + composerHeight - radius);
  return {
    x: Math.max(viewport.left + gutter + half, Math.min(viewport.left + viewport.width - gutter - half, point.x)),
    y: Math.max(minimumY, Math.min(maximumY, point.y)),
  };
}

export function bottomAnchoredScroll(previous: { top: number; height: number }, height: number, contentHeight: number) {
  return Math.max(0, Math.min(contentHeight - height, previous.top + previous.height - height));
}
