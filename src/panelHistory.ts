import { destinationPath, type Destination } from '../shared/navigation';

export type Panel = Exclude<Destination['view'], 'chat' | 'profile'> | 'account' | null;
export interface PanelLocation { panel: Exclude<Panel, null>; context: Omit<Destination, 'view'> }
function sameLocation(a: PanelLocation, b: PanelLocation) {
  if (a.panel !== b.panel) return false;
  if (['post', 'person', 'messages', 'dinder'].includes(a.panel)) return a.context.resourceId === b.context.resourceId;
  const path = (item: PanelLocation) => destinationPath({ ...item.context, view: item.panel === 'account' ? 'profile' : item.panel });
  return path(a) === path(b);
}
const reuseLocation=(original:PanelLocation,target:PanelLocation)=>original.panel==='dinder'?{...original,context:{...original.context,dinderTab:target.context.dinderTab}}:original;
/** Reuse the original entry and its mounted state when navigating to an ancestor. */
export function navigatePanelHistory(history: PanelLocation[], current: PanelLocation | null, target: PanelLocation) {
  if (current && sameLocation(current, target)) return { current:reuseLocation(current,target), history };
  const index = history.findLastIndex(item => sameLocation(item, target));
  if (index >= 0) return { current: reuseLocation(history[index],target), history: history.slice(0, index) };
  return { current: target, history: current ? [...history, current] : history };
}
