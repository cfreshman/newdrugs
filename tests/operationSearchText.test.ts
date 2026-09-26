import {it,expect} from 'vitest';import {z} from 'zod';import {operationSearchText} from '../server/operationSearch';
it('indexes meaningful documentation without validation boilerplate or hardcoded query routing',()=>{
 const op={name:'notes.list',kind:'read',description:'Read saved notes.',schema:z.strictObject({folder:z.enum(['personal','shared']).describe('Folder to browse'),limit:z.number().int().min(1).max(30).default(20)})};
 const text=operationSearchText(op);expect(text).toContain('Read saved notes.');expect(text).toContain('Input.folder: personal, shared');expect(text).toContain('Folder to browse');expect(text).not.toMatch(/additionalProperties|default|maximum|\$schema/);
});
