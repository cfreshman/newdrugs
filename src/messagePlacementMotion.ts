type Rect = { left: number; top: number; width: number; height: number };
export type MessagePlacementSnapshot = { clone: HTMLElement; rect: Rect };
export type MessagePlacementMotion = { finished: Promise<void>; cancel(): void };

function readRect(element: HTMLElement): Rect | null {
  const { left, top, width, height } = element.getBoundingClientRect();
  return [left, top, width, height].every(Number.isFinite) && width > 0 && height > 0
    ? { left, top, width, height } : null;
}
function visualCopy(element: HTMLElement) {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.setAttribute('aria-hidden', 'true');
  clone.setAttribute('inert', '');
  clone.removeAttribute('id');
  clone.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
  clone.querySelectorAll<HTMLElement>('a, button, input, select, textarea, [tabindex]').forEach(node => { node.tabIndex = -1; });
  return clone;
}

/** Capture before clearing the draft, as Wayfinder captures a Team Comm before insertion. */
export function captureMessagePlacement(composer: HTMLElement | null, text: string): MessagePlacementSnapshot | null {
  if (!composer) return null;
  const rect = readRect(composer);
  if (!rect) return null;
  const clone = visualCopy(composer);
  const source = composer.querySelector('textarea');
  const copy = clone.querySelector('textarea');
  if (copy) { copy.value = text; copy.dataset.scrollTop = String(source?.scrollTop || 0); }
  return { clone, rect };
}

/**
 * Wayfinder's placement handoff, with both copies inside one moving object.
 * Animate geometry, not scale: each layer keeps its actual type and reflows.
 * The semantic message exists throughout; the copies are purely visual.
 */
export function animateMessagePlacement(snapshot: MessagePlacementSnapshot, target: HTMLElement): MessagePlacementMotion | null {
  const destination = readRect(target);
  if (!destination || typeof target.animate !== 'function') return null;
  const source = snapshot.clone;
  const message = visualCopy(target);
  const object = document.createElement('div');
  object.className = 'message-placement';
  object.setAttribute('aria-hidden', 'true');
  object.setAttribute('inert', '');
  const dimensions = (rect: Rect) => ({ left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  Object.assign(object.style, dimensions(snapshot.rect));
  for (const layer of [source, message]) {
    layer.removeAttribute('data-message-id');
    Object.assign(layer.style, { position: 'absolute', inset: '0', width: '100%', maxWidth: 'none', margin: '0', pointerEvents: 'none' });
  }
  source.style.height = '100%';
  message.style.opacity = '0';
  object.append(source, message);
  document.body.append(object);
  const textarea = source.querySelector('textarea');
  if (textarea) textarea.scrollTop = Number(textarea.dataset.scrollTop || 0);

  const previous = { opacity: target.style.opacity, pointerEvents: target.style.pointerEvents };
  target.style.opacity = '0';
  target.style.pointerEvents = 'none';
  const duration = parseFloat(getComputedStyle(object).getPropertyValue('--message-flight-ms')) || 460;
  const timing = { duration, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' as const };
  const animations: Animation[] = [];
  let done = false;
  let frame = 0;
  const cleanup = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(frame);
    object.remove();
    target.style.opacity = previous.opacity;
    target.style.pointerEvents = previous.pointerEvents;
    window.removeEventListener('pointerdown', cancel, true);
    window.removeEventListener('wheel', cancel, true);
    window.removeEventListener('resize', cancel);
  };
  const cancel = () => { animations.forEach(animation => animation.cancel()); cleanup(); };
  try {
    animations.push(object.animate([dimensions(snapshot.rect), dimensions(destination)], timing));
    animations.push(source.animate([{ opacity: 1 }, { opacity: 0, offset: .26 }, { opacity: 0 }], timing));
    animations.push(message.animate([{ opacity: 0 }, { opacity: 1, offset: .26 }, { opacity: 1 }], timing));
  } catch { cancel(); return null; }

  // If scrolling, the keyboard or an answer moves the destination, reveal the
  // real bubble immediately instead of landing a clone at stale coordinates.
  const checkDestination = () => {
    const next = readRect(target);
    if (!target.isConnected || !next || Object.keys(destination).some(key => Math.abs(next[key as keyof Rect] - destination[key as keyof Rect]) > 1)) { cancel(); return; }
    frame = requestAnimationFrame(checkDestination);
  };
  frame = requestAnimationFrame(checkDestination);
  window.addEventListener('pointerdown', cancel, true);
  window.addEventListener('wheel', cancel, { capture: true, passive: true });
  window.addEventListener('resize', cancel);
  return { finished: Promise.allSettled(animations.map(animation => animation.finished)).then(cleanup), cancel };
}
