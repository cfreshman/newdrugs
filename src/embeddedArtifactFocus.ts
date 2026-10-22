export const ARTIFACT_EDITABLE_FOCUS_EVENT = 'newdrugs:artifact-editable-focus';

let editableFrame: HTMLIFrameElement | null = null;

function focusedAndVisible(frame: HTMLIFrameElement) {
  if (!frame.isConnected || frame.ownerDocument !== document || document.activeElement !== frame) return false;
  if (frame.closest('[hidden], [inert]')) return false;
  for (let node: HTMLElement | null = frame; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0' || style.contentVisibility === 'hidden') return false;
  }
  return [...frame.getClientRects()].some(rect => rect.width > 0 && rect.height > 0);
}

const changed = () => window.dispatchEvent(new Event(ARTIFACT_EDITABLE_FOCUS_EVENT));

/** Call only after the frame's source, channel and relay payload were verified. */
export function setArtifactEditableFocus(frame: HTMLIFrameElement, active: boolean): void {
  if (!active) { clearArtifactEditableFocus(frame); return; }
  if (!focusedAndVisible(frame)) {
    if (editableFrame === frame) clearArtifactEditableFocus(frame);
    return;
  }
  editableFrame = frame;
  changed();
}

export function clearArtifactEditableFocus(frame: HTMLIFrameElement): void {
  if (editableFrame !== frame) return;
  editableFrame = null;
  changed();
}

/** A prior relay never substitutes for the browser's current focused frame. */
export function artifactEditableFocused(): boolean {
  if (!editableFrame) return false;
  if (focusedAndVisible(editableFrame)) return true;
  editableFrame = null;
  return false;
}
