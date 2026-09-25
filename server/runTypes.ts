import type { RunView, Approval } from '../shared/types';
export interface RunRecord extends Omit<RunView, 'id'> {
  _id: string; userId: string; text: string; clientId: string; timezone: string; fileIds: string[];
  fingerprint: string; reservedNanos: number; costNanos: number; responseIds: string[];
  chargedNanos?: number; billingRate?: { model: string; input: number; cached: number; cacheWrite: number; output: number; version: string }; usagePending?: boolean; usageCheckAt?: number; usageChecks?: number;
  createdAt: string; updatedAt: string; lease?: string; leaseUntil?: number; cancelRequested?: boolean;
  providerSessionId?: string; providerTurnId?: string; previousTurnId?: string; inputSubmitted?: boolean; creatingSession?: boolean; sessionStartsIdle?: boolean; failures: number;
  attempts: number; nextAttempt?: number; approvals: Approval[];
  finalRecovery?: boolean;
}
