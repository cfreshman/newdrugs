import {afterEach,beforeEach,expect,it} from 'vitest';
import {mkdtemp,rm,chmod,readdir,stat,writeFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ConfigStore} from '../cli/config';
import {CatalogCache} from '../cli/catalogCache';

let directory:string;
beforeEach(async()=>{directory=await mkdtemp(join(tmpdir(),'nd-contract-cache-'));await chmod(directory,0o700);});
afterEach(async()=>{await rm(directory,{recursive:true,force:true});});
const operation={name:'identity.get',kind:'read' as const,version:'op1:'+'a'.repeat(64),description:'Read identity',inputSchema:{type:'object'}};

it('reuses only the selected credential and discards metadata on profile changes',async()=>{
 const store=new ConfigStore(join(directory,'config.json'));
 const login={url:'https://dev.druggie.org',token:'test-one'};await store.set('dev',login);
 const cache=new CatalogCache(store,login,'dev');await cache.put(operation);
 expect(await cache.get(operation.name)).toEqual(operation);
 const file=join(directory,'contracts',(await readdir(join(directory,'contracts')))[0]);expect((await stat(file)).mode&0o777).toBe(0o600);
 expect(await new CatalogCache(store,{...login,token:'test-two'},'dev').get(operation.name)).toBeUndefined();
 await store.use('dev');expect(await cache.get(operation.name)).toBeUndefined();
});

it('treats corrupt or unsafe cache files as misses without following symlinks',async()=>{
 const store=new ConfigStore(join(directory,'config.json')),login={url:'https://druggie.org',token:'test'};
 const cache=new CatalogCache(store,login,'default');await cache.put(operation);
 const file=join(directory,'contracts',(await readdir(join(directory,'contracts')))[0]);
 await writeFile(file,'broken json',{mode:0o600});expect(await cache.get(operation.name)).toBeUndefined();
 await rm(join(directory,'contracts'),{recursive:true,force:true});
 const outside=await mkdtemp(join(tmpdir(),'nd-contract-outside-'));
 try{await symlink(outside,join(directory,'contracts'));await cache.put(operation);expect(await readdir(outside)).toEqual([]);expect(await cache.get(operation.name)).toBeUndefined();}
 finally{await rm(outside,{recursive:true,force:true});}
});
