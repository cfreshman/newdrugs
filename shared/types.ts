export interface Profile {
  hasSharedHangouts?: boolean;
  bff?:boolean;
  mutualCount?:number;
  mutualFriends?:{id:string;name:string;photoId?:string}[];
  friendAction?:'invite'|'accept'|'invited'|'friend'|'unavailable';connectionId?:string;hidden?:boolean;
  id: string; handle?: string; name: string; city: string; bio: string;
  interests: string[]; discoverable: boolean;
  area?: import('./geo').CoarseArea | null;
  photos?:string[];
  websiteUrl?:string;
  mediaUrl?:string;
  voiceFileId?:string;
}
export interface Message { pageContext?:import('./pageContext').PageContextCandidate; inputContext?:import('./chatInputContext').ChatInputContext; records?:import('./recordContext').RecordAttachment[];
  id: string; role: 'user' | 'assistant'; text: string; createdAt: string;
  source: 'app' | 'external'; status?: 'complete' | 'interrupted' | 'pending' | 'failed';
  files?: import('./uploads').UploadRef[];
  review?: { runId: string; revision: number };
  failure?: string; inbox?: import('./inbox').InboxAttachment[];
}
export interface Wallet {
  starterAvailableNanos?: number; balanceNanos: number; reservedNanos: number; availableNanos: number;
  entries: { id: string; amountNanos: number; label: string; createdAt: string; details?: Record<string, unknown> }[];
}
export interface Bootstrap {
  preferences?:import('./preferences').AccountPreferences;
  user: Profile; wallet: Wallet; messages: Message[];
  conversationCursor?: string | null; conversationGeneration?: number;
  run?: RunView | null;
  notifications?: import('./notifications').NotificationState;
  config: { aiEnabled: boolean; paymentsEnabled: boolean; development: boolean; model: string; stage?: string; version?: string };
}
export type RunStatus = 'queued' | 'running' | 'waiting_for_approval' | 'waiting_for_input' | 'sleeping' | 'completed' | 'cancelled' | 'failed';
export interface Approval {
  id: string; operation: string; input: Record<string, unknown>; version: string; digest: string;
  title: string; detail: string; target?: string; expiresAt: number;
  status: 'pending' | 'approved' | 'rejected'; human: boolean; kind: 'write' | 'input';
  result?: unknown; logJoin?: import('./logJoining').LogJoinPreview; logEntry?: import('./log').LogEntry; automation?: import('./automations').AutomationConfig;
}
export interface RunView {
  id: string; status: RunStatus; draft: string; progress: { id: string; text: string }[];
  phase?: import('./agentUi').AgentPhase; preamble?: string; cancelRequested?: boolean;
  outputComplete?: boolean; sleep?: { until: number; reason: string };
  approvals: Approval[]; clientId: string; error?: string; revision: number;
  surface?: { id: string; view: string; dinderTab?:'chat'; date?:string; logMonth?:string;logScope?:import('./navigation').Destination['logScope'];personId?:string; resourceId?: string; areaCell?: string; radiusMiles?:number;postIds?:string[];query?:string;scope?:'all'|'nearby'|'own'; waiting: boolean; completed?: boolean };
  sources?: { url: string; title: string }[];
}
