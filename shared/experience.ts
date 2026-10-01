import type { Destination } from './navigation';
export type AppMode = 'agent' | 'friends' | 'posts' | 'log';
export const MODE_LABELS: Record<AppMode,string> = {agent:'Agent',friends:'Friends',posts:'Posts',log:'Log'};
export function modeForDestination(destination:Destination):AppMode {
  if(['log','log_people','log_birthdays','log_anniversaries','log_settings','log_compose','log_code','log_scan','log_join'].includes(destination.view))return 'log';
  if(['feed','post','post_list','compose','spaces'].includes(destination.view))return 'posts';
  if(['people','person','messages','connections'].includes(destination.view))return 'friends';
  return 'agent';
}
export const AGENT_VIEWS=new Set(['chat','inbox','automations','chat_history','uploads']);
export const SOCIAL_VIEWS=new Set(['feed','post','post_list','compose','person','people','messages','connections','spaces']);
export const BROWSER_VIEWS=new Set([...SOCIAL_VIEWS,'log_people','log_birthdays','log_anniversaries','log_settings','log','log_compose','log_code','log_scan','log_join','inbox','automations','chat_history']);
export interface Bounds {left:number;right:number;top:number;bottom:number}
/** Use expanded bounds even while collapsed: shrinking the control must not trigger expansion. */
export function modeSwitchIntersects(chat:Bounds, toggle:Bounds, expandedWidth:number) {
  return chat.right>chat.left&&chat.bottom>chat.top&&chat.left<toggle.left+expandedWidth&&chat.right>toggle.left&&chat.top<toggle.bottom&&chat.bottom>toggle.top;
}
