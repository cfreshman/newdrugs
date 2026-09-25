export interface Profile {
  id: string; handle?: string; name: string; city: string; bio: string;
  interests: string[]; discoverable: boolean;
  area?: import('./geo').CoarseArea | null;
  photos?:string[];
}
export interface Message {
  id: string; role: 'user' | 'assistant'; text: string; createdAt: string;
  source: 'app' | 'external'; status?: 'complete' | 'interrupted' | 'pending' | 'failed';
  files?: import('./uploads').UploadRef[];
}
export interface Wallet {
  balanceNanos: number; reservedNanos: number; availableNanos: number;
  entries: { id: string; amountNanos: number; label: string; createdAt: string; details?: Record<string, unknown> }[];
}
export interface Bootstrap {
  user: Profile; wallet: Wallet; messages: Message[];
  run?: RunView | null;
  notifications?: import('./notifications').NotificationState;
  config: { aiEnabled: boolean; paymentsEnabled: boolean; development: boolean; model: string; stage?: string; version?: string };
}
export type RunStatus = 'queued' | 'running' | 'waiting_for_approval' | 'waiting_for_input' | 'completed' | 'cancelled' | 'failed';
export interface Approval {
  id: string; operation: string; input: Record<string, unknown>; version: string; digest: string;
  title: string; detail: string; target?: string; expiresAt: number;
  status: 'pending' | 'approved' | 'rejected'; human: boolean; kind: 'write' | 'input';
  result?: unknown;
}
export interface RunView {
  id: string; status: RunStatus; draft: string; progress: { id: string; text: string }[];
  phase?: import('./agentUi').AgentPhase; preamble?: string; cancelRequested?: boolean;
  outputComplete?: boolean;
  approvals: Approval[]; clientId: string; error?: string; revision: number;
  surface?: { id: string; view: string; resourceId?: string; areaCell?: string; radiusMiles?:number;postIds?:string[];query?:string;scope?:'all'|'nearby'|'own'; waiting: boolean; completed?: boolean };
  sources?: { url: string; title: string }[];
}
