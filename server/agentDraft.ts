import type { AgentSessionEvent, AgentSessionItem } from 'openai/resources/beta/agents/agents';
import { cleanPreamble, type AgentPhase } from '../shared/agentUi';

interface Segment { id: string; phase: string | null; text: string; complete: boolean }
/** Wayfinder's phase-separated draft model, adapted to hosted Agents API events. */
export class AgentDraft {
  private segments: Segment[] = [];
  private snapshotIds = new Set<string>();
  private eventIds = new Set<string>();
  phase: AgentPhase = 'thinking';
  preamble = '';
  constructor(items: AgentSessionItem[] = []) {
    for (const item of items) this.item(item, true);
  }
  private item(item: AgentSessionItem, snapshot = false) {
    if (item.type === 'message' && item.role === 'assistant' && item.id) {
      const text = item.content.filter(c => c.type === 'output_text').map(c => c.text).join('');
      const index = this.segments.findIndex(s => s.id === item.id);
      const previous = this.segments[index];
      // An item.added event buffered before reconciliation must not erase text
      // that was already present in the newer saved item.
      if (previous?.complete && item.status !== 'completed') return;
      const segment = { id: item.id, phase: item.phase || previous?.phase || null,
        text: item.status === 'completed' || !previous || text.length >= previous.text.length ? text : previous.text,
        complete: item.status === 'completed' };
      if (index === -1) this.segments.push(segment); else this.segments[index] = segment;
      if (snapshot) this.snapshotIds.add(item.id);
      if (this.segments.at(-1)?.id === item.id) {
        if (segment.phase === 'commentary') this.preamble = cleanPreamble(segment.text);
        else { this.preamble = ''; this.phase = 'thinking'; }
      }
    } else if (item.type === 'mcp_call') this.phase = item.name === 'newdrugs_search' ? 'discovering' : 'reading';
    else if (item.type === 'web_search_call') this.phase = 'reading';
    else if (item.type === 'function_call') this.phase = item.name === 'newdrugs_execute' ? 'preparing' : 'thinking';
  }
  apply(event: AgentSessionEvent, bufferedDuringReconciliation = false) {
    if (event.event_id) {
      if (this.eventIds.has(event.event_id)) return;
      this.eventIds.add(event.event_id);
    }
    if (event.type === 'agent.session.turn.item.added' || event.type === 'agent.session.turn.item.done') {
      this.item(event.item); return;
    }
    if (event.type === 'agent.session.turn.output_text.delta') {
      let segment = this.segments.find(s => s.id === event.item_id);
      // Reconciliation may already contain buffered deltas. Never append those a second time.
      // Only the buffered reconciliation overlap is skipped. Future live
      // deltas for an in-progress item must continue to reach the screen.
      if (bufferedDuringReconciliation && this.snapshotIds.has(event.item_id) || segment?.complete) return;
      if (!segment) { segment = { id: event.item_id, phase: null, text: '', complete: false }; this.segments.push(segment); }
      segment.text += event.delta;
      if (segment.phase === 'commentary' && this.segments.at(-1) === segment) this.preamble = cleanPreamble(segment.text);
      else { this.preamble = ''; this.phase = 'thinking'; }
    }
    if (event.type === 'agent.session.turn.output_text.done') {
      const segment = this.segments.find(s => s.id === event.item_id);
      if (segment) { segment.text = event.text; if (this.segments.at(-1) === segment) this.preamble = segment.phase === 'commentary' ? cleanPreamble(event.text) : ''; }
    }
    // Reasoning summaries are deliberately not the visible thinking/status text.
  }
  snapshot() {
    const last = this.segments.at(-1);
    return { draft: this.segments.filter(s => s.phase !== 'commentary').map(s => s.text).filter(Boolean).join('\n\n'), preamble: this.preamble, phase: this.phase,
      outputComplete: Boolean(last?.phase === 'final_answer' && last.complete && last.text) };
  }
}
