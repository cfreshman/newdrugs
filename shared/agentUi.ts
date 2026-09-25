// Adapted from Wayfinder's shared/agentUi/runStatus.ts for New Drugs' run states.
export type AgentPhase = 'thinking' | 'discovering' | 'reading' | 'preparing' | 'verifying';
export function cleanPreamble(value: string) { return value.replaceAll('】【。', '').replace(/ {2,}/g, ' ').trim().slice(0, 160); }
export function agentStatusLabel(args: { status: string; phase?: AgentPhase; preamble?: string; cancelRequested?: boolean }) {
  if (args.cancelRequested) return 'Stopping safely';
  if (args.status === 'waiting_for_approval') return 'Waiting for your approval';
  if (args.status === 'waiting_for_input') return 'Waiting for your input';
  const preamble = cleanPreamble(args.preamble || '');
  if (preamble && (!args.phase || ['thinking', 'discovering', 'reading'].includes(args.phase))) return preamble;
  if (args.phase === 'discovering') return 'Finding the right tools';
  if (args.phase === 'reading') return 'Checking New Drugs';
  if (args.phase === 'preparing') return 'Preparing a change';
  if (args.phase === 'verifying') return 'Verifying the result';
  return 'Thinking';
}
