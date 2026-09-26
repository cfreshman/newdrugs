import { createHash } from 'node:crypto';
import { z } from 'zod';
export function stableJSON(value: unknown): string { return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))) : item); }
function validationShape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(validationShape);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key])=>!['description','title','$schema','$comment','examples','deprecated'].includes(key)).map(([key,item])=>[key,
    ['properties','$defs','patternProperties'].includes(key) && item && typeof item==='object' ? Object.fromEntries(Object.entries(item).map(([name,schema])=>[name,validationShape(schema)])) : ['default','const','enum'].includes(key) ? item : validationShape(item)]));
}
// Bump the individual entry only when execution semantics change without a schema change.
const semanticRevisions: Record<string,number> = { 'automations.create': 2, 'connections.request': 2, 'connections.respond': 2, 'messages.list': 2, 'posts.list': 2, 'conversation.search': 2, 'app.open': 2 };
export function operationVersion(name: string, kind: string, schema: z.ZodType, confirmation: boolean, agent: boolean) {
  return 'op1:'+createHash('sha256').update(stableJSON({name,kind,input:validationShape(z.toJSONSchema(schema)),confirmation,agent,semantics:semanticRevisions[name]||1})).digest('hex');
}
