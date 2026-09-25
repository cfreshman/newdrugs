import { describe, expect, it } from 'vitest';
import { AgentDraft } from '../server/agentDraft';
import { agentStatusLabel } from '../shared/agentUi';
import type { AgentSessionEvent, AgentSessionItem } from 'openai/resources/beta/agents/agents';
const message = (id: string, phase: 'commentary' | 'final_answer', text = '', status = 'in_progress') => ({ id, type:'message',role:'assistant',phase,status,content:text?[{type:'output_text',text}]:[],turn_id:'turn' } as AgentSessionItem);
const event = (type:string, fields: Record<string, unknown>) => ({type,...fields} as AgentSessionEvent);
describe('Wayfinder thinking behavior',()=>{
  it('streams task commentary as the status, never as final answer content',()=>{
    const draft=new AgentDraft();
    draft.apply(event('agent.session.turn.item.added',{item:message('preamble','commentary')}));
    draft.apply(event('agent.session.turn.output_text.delta',{item_id:'preamble',delta:'Checking nearby people'}));
    expect(draft.snapshot()).toMatchObject({draft:'',preamble:'Checking nearby people'});
    expect(agentStatusLabel({status:'running',...draft.snapshot()})).toBe('Checking nearby people');
    draft.apply(event('agent.session.turn.item.added',{item:message('answer','final_answer')}));
    draft.apply(event('agent.session.turn.output_text.delta',{item_id:'answer',delta:'I found two people.'}));
    expect(draft.snapshot()).toMatchObject({draft:'I found two people.',preamble:''});
  });
  it('ignores reasoning summaries and gives consequential states precedence over the preamble',()=>{
    const draft=new AgentDraft();draft.apply(event('agent.session.turn.reasoning_summary_text.done',{item_id:'reason',text:'Internal planning summary'}));
    expect(draft.snapshot()).toMatchObject({draft:'',preamble:''});
    expect(agentStatusLabel({status:'waiting_for_approval',phase:'reading',preamble:'Checking people'})).toBe('Waiting for your approval');
    expect(agentStatusLabel({status:'running',phase:'verifying',preamble:'Checking people'})).toBe('Verifying the result');
    expect(agentStatusLabel({status:'running',cancelRequested:true,preamble:'Checking people'})).toBe('Stopping safely');
  });
  it('does not duplicate buffered text when reconnecting to a saved item',()=>{
    const draft=new AgentDraft([message('answer','final_answer','Hello')]);
    draft.apply(event('agent.session.turn.output_text.delta',{item_id:'answer',delta:'Hello'}),true);
    expect(draft.snapshot().draft).toBe('Hello');
    draft.apply(event('agent.session.turn.item.added',{item:message('answer','final_answer')}));
    expect(draft.snapshot().draft).toBe('Hello');
    draft.apply(event('agent.session.turn.output_text.delta',{item_id:'answer',delta:' there'}));
    expect(draft.snapshot().draft).toBe('Hello there');
    draft.apply(event('agent.session.turn.output_text.done',{item_id:'answer',text:'Hello there'}));
    expect(draft.snapshot().draft).toBe('Hello there');
  });
});
