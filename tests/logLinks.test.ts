import {it,expect} from 'vitest';
import {addedLogLinks,logLinkUrl} from '../shared/logLinks';
it('normalizes bare links and deduplicates attachments without excluding internal app URLs',()=>{expect(addedLogLinks(['https://freshman.dev/'],'freshman.dev')).toEqual(['https://freshman.dev']);expect(logLinkUrl('http://localhost:7330/log/entry')).toBe('http://localhost:7330/log/entry');});
it('rejects unsafe schemes, embedded credentials, markup, and excess attachments',()=>{for(const url of ['javascript:alert(1)','https://secret@example.com','<script>','two words'])expect(()=>logLinkUrl(url)).toThrow();expect(()=>addedLogLinks(Array.from({length:8},(_,i)=>`https://example.com/${i}`),'https://example.com/ninth')).toThrow('eight');});
