import {it,expect,vi} from 'vitest';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {uploadLocalFile} from '../cli/upload';
it('uses the normal verified CLI upload flow for private Log media without exposing the token in a URL',async()=>{const directory=await mkdtemp(join(tmpdir(),'nd-log-upload-'));try{const path=join(directory,'recording.wav');await writeFile(path,'RIFF0000WAVE');const file={id:'00000000-0000-4000-8000-000000000001',uploadUrl:'/api/uploads/00000000-0000-4000-8000-000000000001',ready:true};const invoke=vi.fn().mockResolvedValue({ok:true,data:file}),fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('{}'));await uploadLocalFile({url:'https://druggie.org',token:'fixture-private-token'},path,invoke,'fixture-upload-key',undefined,'log_media');expect(invoke.mock.calls[0][1]).toMatchObject({purpose:'log_media',name:'recording.wav',bytes:12});expect(String(fetch.mock.calls[0][0])).toBe('https://druggie.org'+file.uploadUrl);expect(invoke.mock.calls[1][0]).toBe('files.get');fetch.mockRestore();}finally{await rm(directory,{recursive:true,force:true});}});
