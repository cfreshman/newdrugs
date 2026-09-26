import type { RunView, Approval } from '../shared/types';
export interface RunRecord extends Omit<RunView, 'id'> {
  creationRecoveries?: number; awakeMs?: number; backgroundReadCount?: number; credentialId?: string; completedSleeps?: Record<string, string>;
  purpose?: 'automation'; priority?: number; automationId?: string; automationGeneration?: number; automationName?: string; privateChat?: boolean; accountActivity?: boolean; webSearch?: boolean; budgetNanos?: number;
  delivery?: import('../shared/automations').AutomationOutcome; inboxId?: string; inboxIds?: string[];
  recentDeliveries?: { title: string; links: unknown; createdAt: string }[];
  sleep?: { until: number; reason: string; callId: string; turnId: string; wokeAt?: number }; superseded?: boolean;
  recordRefs?: import('../shared/recordContext').RecordReference[];
  _id: string; userId: string; text: string; clientId: string; timezone: string; fileIds: string[];
  fingerprint: string; reservedNanos: number; costNanos: number; responseIds: string[];
  chargedNanos?: number; billingRate?: { model: string; input: number; cached: number; cacheWrite: number; output: number; version: string }; usagePending?: boolean; usageCheckAt?: number; usageChecks?: number;
  createdAt: string; updatedAt: string; lease?: string; leaseUntil?: number; cancelRequested?: boolean;
  providerSessionId?: string; providerTurnId?: string; previousTurnId?: string; inputSubmitted?: boolean; creatingSession?: boolean; sessionStartsIdle?: boolean; failures: number;
  attempts: number; nextAttempt?: number; approvals: Approval[];
  finalRecovery?: boolean;
  reviewReplies?: { id: string; text: string; files: import('../shared/uploads').UploadRef[]; recordRefs?:import('../shared/recordContext').RecordReference[]; actionIds: string[] }[];
}
